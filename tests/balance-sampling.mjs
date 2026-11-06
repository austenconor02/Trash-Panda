// Reproducible physics/economy sampling, separate from real browser playtesting.
// node tests/balance-sampling.mjs [output JSON path]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-balance-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { config } = require('./config.js'), { freshSave } = require('./saves.js');
  const { Economy } = require('./economy.js'), { Slingshot } = require('./slingshot.js');
  const { World } = require('./world.js'), { Player } = require('./player.js');
  const { Scoring } = require('./scoring.js'), { FlightEquipment } = require('./flight-equipment.js');
  const scenarios = [
    { name: 'fresh', levels: {} },
    { name: 'early', levels: { height: 3, width: 1, strength: 3, jetpack: 1, fuel: 2, engine: 1, left: 1, right: 1 } },
    { name: 'middle', levels: { height: 15, width: 15, strength: 15, jetpack: 1, fuel: 6, engine: 4, efficiency: 3, left: 3, right: 3, suit: 2, oxygen: 7, coinMagnet: 2, scrapMagnet: 2, aero: 2 } },
    { name: 'late', launcherTier: 2, levels: { height: 10, width: 10, strength: 10, jetpack: 1, fuel: 10, engine: 8, efficiency: 7, left: 6, right: 6, suit: 4, oxygen: 10, oxygen2: 10, coinMagnet: 4, scrapMagnet: 4, aero: 4, coinValue: 2, platformValue: 2 } },
    { name: 'moon', planet: 'moon', launcherTier: 3, levels: { height: 15, width: 15, strength: 15, jetpack: 1, fuel: 10, engine: 10, efficiency: 10, left: 10, right: 10, suit: 5, oxygen: 10, oxygen2: 10, oxygen3: 10, coinMagnet: 5, scrapMagnet: 5, aero: 5, coinValue: 3, platformValue: 3, lunarLaunch: 3, lunarEngine: 3, lunarFuel: 3, lunarOxygen: 3, lunarSuit: 2 } },
  ];
  const runs = [];
  for (const scenario of scenarios) for (const mode of ['ballistic', 'mild-thrust']) for (let seedIndex = 0; seedIndex < 10; seedIndex++) {
    const data = freshSave(scenario.name); Object.assign(data.levels, scenario.levels);
    data.tier = scenario.planet ?? 'earth'; data.launcherTier = scenario.launcherTier ?? 1;
    const shop = new Economy(data, () => {}), sling = new Slingshot(shop);
    sling.setViewport(1440, 900);
    const angle = (6 + seedIndex % 5 * 3) * Math.PI / 180, pull = sling.restHeight * (0.9 + seedIndex % 3 * 0.05);
    sling.setPull(-Math.sin(angle) * pull, -Math.cos(angle) * pull);
    const player = new Player(), world = new World(8471 + seedIndex * 104729), gear = new FlightEquipment(data), score = new Scoring();
    player.planet = world.planet = data.tier;
    player.dragFactor = 1 / (1 + data.levels.aero * config.upgradeEffects.dragReductionPerLevel);
    world.coinValueLevel = data.levels.coinValue; world.platformValueLevel = data.levels.platformValue;
    player.reset(sling.restHeight + sling.pull.y); player.x = sling.pull.x; player.launch(sling.velocity());
    let settled = 0, failed = false, bounces = 0, satelliteHits = 0;
    const dt = config.physics.fixedStep, limit = 300;
    for (let frame = 0; frame < limit / dt; frame++) {
      const time = frame * dt;
      world.update(player.x, player.y, 1440 / config.camera.zoom, 900 / config.camera.zoom, dt);
      const x = player.x, y = player.y;
      // A reproducible simple pilot: gentle initial thrust, then recovery near apex;
      // brief directional input/braking. No target selection, boosts, or teleporting.
      const up = mode === 'mild-thrust' && (time > 0.6 && time < 4 || player.vy < 250);
      const right = mode === 'mild-thrust' && time > 3 && time < 4;
      const left = mode === 'mild-thrust' && time > 6 && time < 7;
      if (!failed) gear.step(player, { up, right, left, boost: false }, dt);
      if (gear.health <= 0) { failed = true; gear.thrusting = false; player.thrustingUp = false; }
      world.attract(player.x, player.y, data.levels.coinMagnet, data.levels.scrapMagnet, dt);
      const rewards = player.step(dt, world, !failed);
      if (rewards.satellite && !rewards.satellite.landing) {
        gear.health = Math.max(0, gear.health - config.satellites.damage); satelliteHits++;
        if (gear.health <= 0) failed = true;
      }
      if (rewards.platformCents || rewards.satellite?.landing) { gear.bounce(); bounces++; }
      score.step(player, x, y, dt, rewards, !failed);
      settled = player.grounded && Math.abs(player.vx) < config.physics.stopSpeed && player.vy === 0 ? settled + dt : 0;
      if (player.arrived) score.maxAltitude = Math.max(score.maxAltitude, world.ceilingY * config.feetPerUnit);
      if (player.arrived || settled >= 0.5) break;
    }
    score.finalize(failed, data.levels.funerals);
    const payout = score.breakdown();
    runs.push({ scenario: scenario.name, mode, seed: 8471 + seedIndex * 104729, duration: +score.duration.toFixed(2), peakFeet: Math.round(score.maxAltitude), money: payout.totalCents / 100, scrap: score.scrap, coins: score.coins, bounces, satelliteHits, failed, arrived: player.arrived, capped: score.duration >= limit - dt });
  }
  const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : 0; };
  const summaries = scenarios.flatMap(scenario => ['ballistic', 'mild-thrust'].map(mode => {
    const all = runs.filter(run => run.scenario === scenario.name && run.mode === mode), group = all.filter(run => !run.capped);
    return { scenario: scenario.name, mode, completed: group.length, medianMoney: +median(group.map(run => run.money)).toFixed(2), minMoney: Math.min(...group.map(run => run.money)), maxMoney: Math.max(...group.map(run => run.money)), medianSeconds: +median(group.map(run => run.duration)).toFixed(2), medianPeak: median(group.map(run => run.peakFeet)), totalScrap: group.reduce((sum, run) => sum + run.scrap, 0), averageScrap: group.reduce((sum, run) => sum + run.scrap, 0) / group.length, deaths: group.filter(run => run.failed).length, arrivals: group.filter(run => run.arrived).length, capped: all.filter(run => run.capped).length };
  }));
  const result = { method: 'Deterministic physics sampling, 10 seeds each. 90–100% pull, 6–18 degree pull angles; no optimized routing, boosts, or teleports. This is not browser playtesting. 300-second safety cap; summary payouts exclude unfinished capped runs.', balance: { scoring: config.scoring, launcherTiers: config.launcherTiers, propulsion: config.propulsion, fuelTank: config.fuelTank }, scenarios, summaries, runs };
  if (process.argv[2]) { fs.mkdirSync(path.dirname(process.argv[2]), { recursive: true }); fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2)); }
  console.table(summaries);
} finally {
  if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('trash-panda-balance-')) fs.rmSync(temporary, { recursive: true, force: true });
}
