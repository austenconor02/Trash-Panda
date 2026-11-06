import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-salvage-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { World } = require('./world.js'), { Player } = require('./player.js'), { SatelliteField } = require('./satellites.js');
  const { Scoring } = require('./scoring.js'), { PaydayTimeline, paydayTiming } = require('./payday.js');
  const { cloudsInView } = require('./cloud-scene.js');
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

  for (const x of [-100000, -100, 0, 100000]) {
    const clouds = cloudsInView(x, 250, 1200, 800, 12);
    assert.ok(new Set(clouds.map(cloud => cloud.depth)).size >= 2, 'multiple cloud depths remain visible on both sides of launch');
    assert.ok(clouds.length < 150 && clouds.every(cloud => Number.isFinite(cloud.x + cloud.y)), 'only nearby clouds are materialized');
    assert.deepEqual(cloudsInView(x, 250, 1200, 800, 12), clouds, 'returning to the same view does not reroll clouds');
  }
  assert.deepEqual(cloudsInView(0, 15000, 1200, 800, 12), [], 'clouds stop below orbit');

  const world = new World(91);
  const coin = { id:'magnet-test', tier:'gold', x:100, y:1000 };
  const scrap = { id:'scrap-test', tier:'scrap', x:110, y:1000 };
  world.chunks.set('0:1', { platforms:[], coins:[coin, scrap] });
  let coins = 0, cents = 0;
  for (let step = 0; step < 60; step++) {
    world.attract(0, 1000, 5, 0, 1 / 120);
    const reward = world.collect(0, 1000, 0, 1000); coins += reward.coins; cents += reward.coinCents;
    if (step === 0) assert.ok(coin.x > 95 && coin.x < 100 && coins === 0, 'magnet motion begins gently and cannot disappear in the first frame');
    if (step === 20) assert.equal(coins, 0, 'the visible collection flight is allowed to finish');
  }
  assert.equal(coins, 1); assert.equal(cents, 50, 'a completed magnet flight credits its coin once');
  assert.equal(scrap.x, 110, 'a coin magnet does not attract scrap');
  assert.equal(world.pickups.length, 1, 'the collected sprite lingers as a shrinking pickup flash');
  world.update(0, 1000, 900, 600, .3); assert.equal(world.pickups.length, 0, 'pickup visuals expire');

  const traveling = new World(43); traveling.update(0, 1000, 900, 600, 0);
  const original = traveling.generate(0, 1).coins.find(coin => coin.tier !== 'scrap');
  const reserved = traveling.coins.find(coin => coin.id === original.id);
  traveling.attract(reserved.x + 80, reserved.y, 5, 0, .01);
  assert.ok(reserved.magnet);
  traveling.update(100000, 1000, 900, 600, 0);
  assert.ok(traveling.coins.includes(reserved), 'a captured coin survives unloading its original chunk');
  assert.ok(!traveling.generate(0, 1).coins.some(coin => coin.id === reserved.id), 'a captured coin cannot be regenerated behind the player');

  const fixture = (height = 11080, velocityY = -1000, platformY = null) => {
    const world = new World(7), player = new Player();
    world.chunks.set('fixture', { platforms:platformY === null ? [] : [{ id:'under-satellite', x:440, y:platformY, width:150, tier:'silver', used:false, age:0, vy:0 }], coins:[] });
    player.reset(height); player.x = 430; player.vx = 280; player.vy = velocityY; player.fallSpeedLimit = 100000;
    world.satellites.update(.1);
    return { world, player };
  };
  const landing = fixture();
  let rewards = landing.player.step(.1, landing.world);
  assert.equal(rewards.scrap, 10); assert.equal(rewards.satellite.landing, true);
  assert.equal(rewards.platformCents, 0); assert.equal(landing.world.satellites.impactFlash, 0, 'salvage does not trigger the damage flash');
  near(landing.player.y, 11035); assert.ok(landing.player.reboundVelocity > 0, 'landing starts a smooth platform rebound');
  assert.equal(landing.world.satellites.wreckage.length, 1);
  assert.ok(!landing.world.satellites.visible(-1000, 1000, 10000, 12000).some(s => s.id === rewards.satellite.id));
  rewards = landing.player.step(.05, landing.world); assert.equal(rewards.scrap, 0); assert.ok(landing.player.vy > 0);
  const wreck = landing.world.satellites.wreckage[0], originalY = wreck.y;
  landing.world.satellites.update(.5); assert.ok(wreck.y < originalY, 'broken satellites fall instead of continuing in orbit');
  landing.world.satellites.update(6); assert.equal(landing.world.satellites.wreckage.length, 0);
  assert.ok(landing.world.satellites.broken.size > 0, 'expired wreckage does not restore destroyed satellites');
  landing.world.satellites.reset(); assert.equal(landing.world.satellites.broken.size, 0);

  const side = fixture(11010, -10); side.player.x = 250; side.player.vx = 3000;
  rewards = side.player.step(.1, side.world);
  assert.equal(rewards.satellite.landing, false); assert.equal(rewards.scrap, 0); assert.ok(side.player.vy < 0); assert.equal(side.world.satellites.wreckage.length, 0);
  const ascent = fixture(10800, 4000);
  rewards = ascent.player.step(.1, ascent.world); assert.equal(rewards.satellite.landing, false); assert.equal(rewards.scrap, 0); assert.ok(ascent.player.vy < 0);
  const diagonalField = new SatelliteField(), diagonal = new Player(); diagonal.x = 400; diagonal.y = 11000; diagonal.vy = -100;
  assert.equal(diagonalField.contact(diagonal, 250, 11080).landing, false, 'descending through a side face is still an impact');
  const fast = fixture(11400, -10000, 10900);
  rewards = fast.player.step(.1, fast.world);
  assert.equal(rewards.scrap, 10); assert.equal(rewards.platformCents, 0); assert.equal(fast.world.platforms[0].used, false, 'a high-speed landing cannot also collect a lower platform');
  const higher = fixture(11400, -10000, 11200);
  rewards = higher.player.step(.1, higher.world);
  assert.equal(rewards.scrap, 0); assert.equal(rewards.platformCents, 100); assert.equal(higher.world.satellites.wreckage.length, 0, 'the first crossed platform wins over a lower satellite');

  const score = new Scoring();
  Object.assign(score, { maxAltitude:101056, distance:200000, duration:62.4, spaceDuration:16.4, coinCents:875, platformCents:600 });
  const payout = score.breakdown();
  assert.deepEqual(payout.rows.map(row => row.amountCents), [60634, 3120, 60000, 5000, 2050]);
  assert.equal(payout.totalCents, payout.rows.reduce((sum, row) => sum + row.amountCents, 0) + payout.collectedCents);
  const timeline = new PaydayTimeline();
  timeline.start({ maxHeight:score.maxAltitude, flightSeconds:score.duration, distance:score.distance, spaceSeconds:score.spaceDuration, scrap:10, totalCents:payout.totalCents, earnings:payout.rows, collectedCents:payout.collectedCents });
  for (let step = 0; step < 1800; step++) {
    const snapshot = timeline.step(1 / 120);
    assert.ok(snapshot.rows.filter(row => row.visible && !row.complete).length <= 1, 'each stat finishes before the next begins');
    if (snapshot.complete) break;
  }
  const result = timeline.snapshot(); assert.equal(result.complete, true); assert.equal(result.moneyCents, payout.totalCents);
  assert.deepEqual(result.rows.filter(row => row.rateCents !== null).map(row => row.earningsCents), payout.rows.map(row => row.amountCents));
  assert.ok(paydayTiming.rowStagger - paydayTiming.rowCount >= .5, 'completed equations remain readable before the next row');
  console.log('Sky/collection/salvage checks passed: stable cloud depths, visible magnet flights, one-time credits, moving top landings, side/upward hazards, first-contact ordering, and sequential exact payday math.');
} finally { fs.rmSync(temporary, { recursive:true, force:true }); }
