// Fuel capacity and fresh-platform recovery checks, with an isolated in-memory save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-fuel-'));
const priorStorage = globalThis.localStorage;
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { config } = require('./config.js'), { fuelTankCapacity } = require('./fuel.js');
  const { freshSave, SaveManager } = require('./saves.js'), { Economy } = require('./economy.js');
  const { FlightEquipment } = require('./flight-equipment.js'), { Player } = require('./player.js'), { World } = require('./world.js');
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
  const weights = [1, 1.4, 1.9, 2.3, 2.8, 3.2, 3.7, 4.1, 4.6, 5];
  assert.deepEqual(config.fuelTank.upgradeWeights, weights, 'tank progression keeps its existing ten upgrade weights');
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const data = freshSave('Fuel test');
  data.moneyCents = 100000000;
  const shop = new Economy(data, () => {});
  const originalCapacity = level => 2 + (40.5 - 2) * weights.slice(0, level).reduce((sum, weight) => sum + weight, 0) / weightTotal;
  for (let level = 0; level <= 10; level++) {
    near(fuelTankCapacity(level), originalCapacity(level) * 1.2, `Earth tank level ${level} gains exactly 20%`);
    data.levels.jetpack = 1; data.levels.fuel = level; data.tier = 'moon';
    for (let lunar = 0; lunar <= 10; lunar++) {
      data.levels.lunarFuel = lunar;
      near(new FlightEquipment(data).capacity, (originalCapacity(level) + lunar * 2) * 1.2, `Moon tank ${level}/${lunar} also gains exactly 20%`);
    }
    if (level > 0) assert.equal(shop.cost('fuel', level).moneyCents, Math.round(50 * 100 * 1.8 ** (level - 1)), 'tank prices are unchanged');
  }
  near(fuelTankCapacity(0), 2.4, 'starter capacity');
  near(fuelTankCapacity(10), 48.6, 'maximum Earth capacity');
  assert.equal(shop.definition('fuel').max, 10);

  const early = freshSave('No debris needed'); early.moneyCents = 1000000;
  const earlyShop = new Economy(early, () => {});
  assert.equal(earlyShop.definition('landingFuel').name, 'Fuel Absorber');
  assert.equal(earlyShop.definition('landingFuel').max, 5);
  assert.equal(earlyShop.locked('landingFuel'), true, 'the absorber still requires a jetpack');
  assert.equal(earlyShop.purchase('landingFuel'), false);
  assert.equal(earlyShop.purchase('jetpack'), true);
  assert.equal(early.scrapCollected, 0); assert.equal(early.scrap, 0);
  assert.equal(earlyShop.locked('landingFuel'), false, 'the jetpack is the only absorber prerequisite');
  assert.deepEqual(earlyShop.cost('landingFuel', 1), { moneyCents: 8500, scrap: 0 });
  for (let level = 1; level <= 5; level++) {
    assert.equal(earlyShop.cost('landingFuel', level).moneyCents, Math.round(85 * 100 * 1.8 ** (level - 1)), 'absorber prices keep their existing growth');
  }
  assert.equal(earlyShop.purchase('landingFuel'), true);
  const earlyGear = new FlightEquipment(early);
  earlyGear.fuel = 0; earlyGear.health = 63; earlyGear.bounce();
  near(earlyGear.fuel, 0.5, 'the first early-game absorber restores a useful half gallon');
  assert.equal(earlyGear.health, 63, 'absorbing fuel does not heal');
  earlyGear.fuel = 2.3; earlyGear.bounce(); near(earlyGear.fuel, 2.4, 'refills stop at tank capacity');
  assert.equal(earlyShop.purchase('landingFuel', 5), true);
  earlyGear.fuel = 0; earlyGear.bounce(); near(earlyGear.fuel, 2.4, 'level five can fill the starter tank');

  const large = freshSave('Large tank'); large.levels.jetpack = 1; large.levels.fuel = 10;
  const largeGear = new FlightEquipment(large);
  for (let level = 0; level <= 5; level++) {
    large.levels.landingFuel = level; largeGear.fuel = 0; largeGear.bounce();
    near(largeGear.fuel, 48.6 * 0.04 * level, `large tank absorber level ${level} scales with capacity`);
  }
  near(largeGear.fuel, 9.72, 'level five restores 20% of a 48.6-gallon tank');
  largeGear.fuel = 48; largeGear.bounce(); near(largeGear.fuel, 48.6, 'large refills cannot overfill');
  large.tier = 'moon'; large.levels.lunarFuel = 10; largeGear.reset(); largeGear.fuel = 0; largeGear.bounce();
  near(largeGear.fuel, 14.52, 'absorption includes the enlarged lunar reserve');
  largeGear.fuel = 0; largeGear.health = 63;
  const idlePlayer = new Player(); idlePlayer.reset(1000);
  largeGear.step(idlePlayer, { up: false, left: false, right: false, boost: false }, 10);
  assert.equal(largeGear.fuel, 0, 'there is no automatic fuel regeneration between bounces');
  assert.equal(largeGear.health, 63);

  // The real collision/reward path emits only one platform payout, which is the
  // production Game's signal to run FlightEquipment.bounce().
  const world = new World(77), player = new Player();
  const platform = { id: 'absorber-platform', x: 0, y: 1000, width: 200, tier: 'silver', used: false, age: 0, vy: 0 };
  world.chunks.set('test', { platforms: [platform], coins: [] });
  const collide = () => { player.reset(platform.y + config.player.radius + 20); player.vy = -400; return player.step(0.1, world); };
  const first = collide();
  assert.ok(first.platformCents > 0, 'a fresh platform triggers the absorber event');
  earlyGear.fuel = 0;
  if (first.platformCents) earlyGear.bounce();
  const recovered = earlyGear.fuel;
  const repeated = collide();
  if (repeated.platformCents) earlyGear.bounce();
  assert.equal(repeated.platformCents, 0, 'an already-used platform has no second absorption event');
  assert.equal(earlyGear.fuel, recovered);
  assert.equal(world.bounce({ ...platform, used: false }).platformCents, 0, 'recreated consumed platforms cannot issue another refill');

  const saved = freshSave('Existing owner'); saved.levels.jetpack = 1; saved.levels.fuel = 10; saved.levels.landingFuel = 3;
  saved.moneyCents = 1200; saved.flights = 17; saved.scrapCollected = 0;
  const saves = new SaveManager(); saves.write(0, saved);
  const loaded = new SaveManager().slots[0];
  assert.equal(loaded.levels.landingFuel, 3, 'the existing landingFuel save key keeps owned absorber levels');
  assert.equal(loaded.levels.fuel, 10); assert.equal(loaded.moneyCents, 1200); assert.equal(loaded.flights, 17);
  const loadedGear = new FlightEquipment(loaded); loadedGear.fuel = 0; loadedGear.bounce();
  near(loadedGear.capacity, 48.6, 'existing saves receive enlarged capacity automatically');
  near(loadedGear.fuel, 5.832, 'owned absorbers immediately receive the stronger recovery');
  console.log('Fuel upgrades passed: 20% tank gains at every Earth/Moon level, unchanged prices, early absorber access, strong capped recovery, fresh-platform-only events, and existing saves.');
} finally {
  globalThis.localStorage = priorStorage;
  fs.rmSync(temporary, { recursive: true, force: true });
}
