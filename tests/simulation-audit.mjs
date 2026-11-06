// Deterministic simulations supplement, and do not replace, browser playtesting.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-simulation-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { config } = require('./config.js');
  const { freshSave } = require('./saves.js');
  const { upgradeDefinitions } = require('./upgrade-definitions.js');
  const { World } = require('./world.js');
  const { Player } = require('./player.js');
  const { FlightEquipment } = require('./flight-equipment.js');
  const { Economy } = require('./economy.js');
  const { Slingshot } = require('./slingshot.js');
  const { Scoring } = require('./scoring.js');

  function setup(profile, planet = 'earth', pull = 0.8, angle = 0) {
    const data = freshSave('Isolated simulation'); data.tier = planet;
    if (profile === 'middle') {
      data.launcherTier = 2;
      for (const key of ['height', 'width', 'strength']) data.levels[key] = 7;
      for (const key of ['fuel', 'engine', 'efficiency', 'left', 'right', 'oxygen']) data.levels[key] = 5;
      data.levels.jetpack = 1; data.levels.suit = 3; data.levels.aero = 2;
      data.levels.coinMagnet = data.levels.scrapMagnet = 2;
    } else if (profile === 'maximum' || profile === 'moon-entry' || profile === 'lunar3') {
      data.launcherTier = 3;
      for (const [key, rule] of Object.entries(upgradeDefinitions)) {
        if (!rule.consumable && ((planet === 'moon' && profile === 'maximum') || rule.planet !== 'moon')) data.levels[key] = rule.max;
      }
      if (profile === 'lunar3') for (const [key, rule] of Object.entries(upgradeDefinitions)) if (rule.planet === 'moon') data.levels[key] = 3;
    }
    const player = new Player(), world = new World(24680), equipment = new FlightEquipment(data), score = new Scoring();
    const sling = new Slingshot(new Economy(data, () => {})); sling.setViewport(1440, 900);
    sling.setPull(Math.sin(angle) * sling.restHeight * pull, -Math.cos(angle) * sling.restHeight * pull);
    player.reset(sling.restHeight + sling.pull.y); player.x = sling.pull.x;
    player.planet = world.planet = planet;
    player.dragFactor = 1 / (1 + data.levels.aero * config.upgradeEffects.dragReductionPerLevel);
    player.launch(sling.velocity());
    world.coinValueLevel = data.levels.coinValue; world.platformValueLevel = data.levels.platformValue;
    return { data, player, world, equipment, score, ticks: 0, settled: 0, finished: false, died: false, bounces: 0, maxObjects: 0 };
  }
  function step(run, powered) {
    const { player, world, equipment, score, data } = run, dt = config.physics.fixedStep;
    world.update(player.x, player.y, 1440 / config.camera.zoom, 900 / config.camera.zoom, dt);
    const x = player.x, y = player.y;
    // Deliberately intermittent thrust, with occasional direction mistakes. No
    // route targeting, platform prediction, consumables, or health refills.
    const seconds = run.ticks * dt;
    const controls = { up: powered && seconds % 4 < 2.6, left: powered && seconds % 11 > 9, right: powered && seconds % 13 > 11, boost: false };
    if (!run.died) equipment.step(player, controls, dt);
    run.died ||= equipment.health <= 0;
    if (run.died) player.thrustingUp = false;
    world.attract(player.x, player.y, data.levels.coinMagnet, data.levels.scrapMagnet, dt);
    const rewards = player.step(dt, world, !run.died);
    if (rewards.satellite && !rewards.satellite.landing) {
      equipment.health = Math.max(0, equipment.health - config.satellites.damage);
      run.died ||= equipment.health <= 0;
    }
    if (rewards.platformCents || rewards.satellite?.landing) { equipment.bounce(); run.bounces++; }
    score.step(player, x, y, dt, rewards, !run.died);
    run.ticks++;
    run.settled = player.grounded && Math.abs(player.vx) < config.physics.stopSpeed && player.vy === 0 ? run.settled + dt : 0;
    run.finished = player.arrived || run.settled >= config.flow.landingHoldSeconds;
    if (player.arrived) score.maxAltitude = Math.max(score.maxAltitude, world.ceilingY * config.feetPerUnit);
    run.maxObjects = Math.max(run.maxObjects, world.platforms.length + world.coins.length);
  }
  function result(run) {
    run.score.finalize(run.died, run.data.levels.funerals);
    return {
      seconds: +run.score.duration.toFixed(3), altitudeFeet: Math.round(run.score.maxAltitude),
      arrived: run.player.arrived, healthy: !run.died, finished: run.finished,
      fuelRemaining: +run.equipment.fuel.toFixed(3), oxygenRemaining: +run.equipment.oxygen.toFixed(3),
      healthRemaining: +run.equipment.health.toFixed(3), bounces: run.bounces,
      coins: run.score.coins, scrap: run.score.scrap,
      payoutDollars: run.score.breakdown().totalCents / 100, maxActiveObjects: run.maxObjects,
      position: [run.player.x, run.player.y, run.player.vx, run.player.vy], ticks: run.ticks,
    };
  }
  const frameRates = [];
  const commonTick = Math.floor(90 / config.physics.fixedStep) - 2;
  for (const hz of [30, 60, 144]) {
    const run = setup('middle', 'earth', 0.8, -0.15);
    let accumulator = 0, lastTime = 1000, commonPosition;
    for (let frame = 0; frame < hz * 90; frame++) {
      const time = 1000 + (frame + 1) * 1000 / hz;
      accumulator += Math.min((time - lastTime) / 1000, config.physics.maxFrame); lastTime = time;
      while (accumulator >= config.physics.fixedStep) {
        if (!run.finished) step(run, true);
        if (run.ticks === commonTick) commonPosition = [run.player.x, run.player.y, run.player.vx, run.player.vy];
        accumulator -= config.physics.fixedStep;
      }
    }
    frameRates.push({ hz, commonTick, commonPosition, ...result(run) });
  }
  for (const run of frameRates.slice(1)) {
    assert.deepEqual(run.commonPosition, frameRates[0].commonPosition, 'render rates must drive identical trajectories at the same physics step');
    assert.ok(Math.abs(run.ticks - frameRates[0].ticks) <= 1, 'floating-point frame accumulation differs by at most one fixed step');
    assert.equal(run.coins, frameRates[0].coins);
    assert.equal(run.scrap, frameRates[0].scrap);
  }

  const repeatedWorld = new World(99), counts = { runs: 30, regionsPerRun: 40, maxChunks: 0, maxPlatforms: 0, maxPickups: 0, maxLedger: 0 };
  for (let run = 0; run < counts.runs; run++) {
    repeatedWorld.reset(1000 + run);
    assert.equal(repeatedWorld.chunks.size, 0); assert.equal(repeatedWorld.consumed.size, 0);
    assert.equal(repeatedWorld.effects.length, 0); assert.equal(repeatedWorld.visualTime, 0); assert.equal(repeatedWorld.satellites.time, 0);
    for (let region = 0; region < counts.regionsPerRun; region++) {
      const x = (region - 20) * 4000, y = 1000 + (region % 10) * 2000;
      repeatedWorld.update(x, y, 1440 / config.camera.zoom, 900 / config.camera.zoom, 0.2);
      counts.maxChunks = Math.max(counts.maxChunks, repeatedWorld.chunks.size);
      counts.maxPlatforms = Math.max(counts.maxPlatforms, repeatedWorld.platforms.length);
      counts.maxPickups = Math.max(counts.maxPickups, repeatedWorld.coins.length);
      for (const platform of repeatedWorld.platforms.slice(0, 4)) repeatedWorld.bounce(platform);
      for (const coin of repeatedWorld.coins.slice(0, 8)) repeatedWorld.collect(coin.x, coin.y, coin.x, coin.y);
      counts.maxLedger = Math.max(counts.maxLedger, repeatedWorld.consumed.size);
      assert.ok(repeatedWorld.chunks.size <= 25, 'active chunks depend on viewport, not elapsed runs or distance');
      assert.ok(repeatedWorld.effects.length <= 80, 'short-lived effects expire during travel');
    }
  }
  repeatedWorld.reset();
  assert.equal(repeatedWorld.consumed.size, 0);

  const viability = [];
  for (const [profile, planet, pull, angle, powered] of [
    ['starter', 'earth', 0.8, 0, false],
    ['middle', 'earth', 0.8, -0.15, true],
    ['maximum', 'earth', 0.65, -0.15, true],
    ['maximum', 'earth', 0.8, 0.2, true],
    ['moon-entry', 'moon', 0.65, -0.15, true],
    ['moon-entry', 'moon', 0.8, 0.2, true],
    ['maximum', 'moon', 0.65, -0.15, true],
    ['maximum', 'moon', 0.8, 0.2, true],
  ]) {
    const run = setup(profile, planet, pull, angle);
    while (!run.finished && run.ticks < 120 * 900) step(run, powered);
    viability.push({ profile, planet, pull, angleRadians: angle, intermittentThrust: powered, ...result(run) });
  }
  const artifact = {
    category: 'Physics/object-count simulations; not browser gameplay or heap profiling',
    controlPolicy: '65% upward-thrust duty cycle; occasional opposing horizontal inputs; no targeted bounces or consumables',
    balanceSnapshot: { physics: config.physics, flow: config.flow, propulsion: config.propulsion, launcherTiers: config.launcherTiers, lunar: config.lunar, scoring: config.scoring, survival: config.survival },
    frameRates, boundedWorldObjects: counts, viability,
  };
  fs.mkdirSync('artifacts/playtest', { recursive: true });
  fs.writeFileSync('artifacts/playtest/simulation-audit.json', JSON.stringify(artifact, null, 2) + '\n');
  if (process.argv.includes('--lunar-sweep')) {
    const originalMultiplier = config.lunar.launchMultiplier, lunarSweep = [];
    for (const multiplier of [1, 1.25, 1.5, 2]) {
      config.lunar.launchMultiplier = multiplier;
      for (const profile of ['moon-entry', 'lunar3']) for (const [pull, angle] of [[0.65, -0.15], [0.8, 0.2]]) {
        const run = setup(profile, 'moon', pull, angle);
        while (!run.finished && run.ticks < 120 * 900) step(run, true);
        lunarSweep.push({ multiplier, profile, pull, angleRadians: angle, ...result(run) });
      }
    }
    config.lunar.launchMultiplier = originalMultiplier;
    const spaceMultiplierSweep = [60, 120, 180, 300, 600, 900].map(spaceDuration => {
      const score = new Scoring(); score.spaceDuration = spaceDuration;
      return { spaceSeconds:spaceDuration, earningsCents:score.breakdown().rows.find(row => row.id === 'spaceTime')?.amountCents ?? 0, dollarsPerSecond:config.scoring.spaceSecond };
    });
    fs.writeFileSync('artifacts/playtest/lunar-balance-sweep.json', JSON.stringify({ category: 'In-memory config simulation only; source balance unchanged', controlPolicy: artifact.controlPolicy, lunarSweep, spaceMultiplierSweep }, null, 2) + '\n');
    console.log(JSON.stringify({ lunarSweep, spaceMultiplierSweep }, null, 2));
  } else console.log(JSON.stringify(artifact, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
