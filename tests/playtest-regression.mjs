// Focused regression checks for issues found in the isolated browser playtest.
// This test owns a memory-only localStorage and does not open a browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-playtest-'));
const prior = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, localStorage: globalThis.localStorage };
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { config } = require('./config.js'), { Scoring } = require('./scoring.js');
  const { SurvivalGuide } = require('./survival-guide.js');
  const { freshSave, SaveManager } = require('./saves.js'), { FlightEquipment } = require('./flight-equipment.js');
  const { Player } = require('./player.js');
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

  // Independent stat earnings, conditional space rows, and exact bank credit.
  const score = new Scoring();
  score.maxAltitude = 10000; score.distance = 20000; score.duration = 20; score.coinCents = 11; score.platformCents = 500;
  const early = score.breakdown();
  assert.deepEqual(early.rows.map(row => row.amountCents), [6000, 1000, 6000]);
  assert.equal(early.totalCents, 13511, 'the receipt adds stat earnings and collected cash');
  score.maxAltitude = 350000; score.distance = 700000; score.duration = 400;
  for (const seconds of [0, 59, 60, 119, 120, 179, 300, 600, 900]) {
    score.spaceDuration = seconds;
    assert.equal(score.breakdown().rows.find(row => row.id === 'spaceTime').amountCents, seconds * 125, `separate space earnings at ${seconds}s`);
  }
  const earnedMoney = score.breakdown().totalCents;
  score.finalize(true, 0);
  assert.equal(score.breakdown().totalCents, Math.floor(earnedMoney * 0.25), 'funeral retention applies after separate earnings');

  // Warn with at least five seconds of breathable time for every suit/tank level.
  const idle = { up: false, left: false, right: false, boost: false };
  for (const suit of [0, 1, 2, 3, 4, 5]) for (const oxygen of [0, 10]) {
    const data = freshSave('Warning timing'); data.levels.suit = suit; data.levels.oxygen = oxygen;
    const gear = new FlightEquipment(data), guide = new SurvivalGuide();
    gear.oxygenDraining = true;
    const warningAt = Math.max(config.guide.oxygenWarningSeconds * gear.oxygenBurnRate, gear.oxygenCapacity * config.guide.oxygenLowFraction);
    gear.oxygen = warningAt + 0.01;
    guide.update(0, gear, data, 50000);
    assert.ok(!guide.message.includes('running low'), `suit ${suit}, tank ${oxygen}: warning is tied to threshold`);
    gear.oxygen = warningAt;
    guide.update(0, gear, data, 50000);
    assert.ok(guide.message.includes('running low'), `suit ${suit}, tank ${oxygen}: low-air warning triggers`);
    assert.ok(gear.oxygen / gear.oxygenBurnRate >= 5 - 1e-9, 'warning leaves at least five seconds at the actual suit burn rate');
    const player = new Player(); player.reset(config.survival.thresholdFeet / config.feetPerUnit);
    const before = gear.oxygen;
    gear.step(player, idle, 1);
    near(before - gear.oxygen, gear.oxygenBurnRate, 'warning uses the same oxygen burn as equipment');
    assert.equal(gear.oxygenDamageRate, 0, 'the warning arrives before oxygen-loss damage');
  }

  const warned = [], data = freshSave('Urgent warnings'), gear = new FlightEquipment(data);
  const guide = new SurvivalGuide(message => warned.push(message));
  gear.oxygenDraining = true;
  guide.update(0, gear, data, 50000);
  assert.equal(warned.length, 1); assert.ok(warned[0].includes('Air is getting thin'));
  gear.oxygen = 5;
  guide.update(0, gear, data, 50000);
  assert.equal(warned.length, 2, 'low-air speech bypasses the eight-second advisory cooldown');
  assert.ok(warned[1].includes('running low'));
  guide.update(0, gear, data, 50000);
  assert.equal(warned.length, 2, 'urgent warning does not restart every frame');
  gear.oxygen = 0; gear.oxygenDamageRate = 12;
  guide.update(0, gear, data, 50000);
  assert.equal(warned.length, 3); assert.ok(warned[2].startsWith('Out of air'), 'empty-air speech bypasses cooldown too');
  const critical = [], healthGuide = new SurvivalGuide(message => critical.push(message));
  gear.oxygenDamageRate = 0; gear.oxygenDraining = false; gear.oxygen = 12;
  gear.coldDamageRate = 1; gear.healthDraining = true;
  healthGuide.update(0, gear, data, 15000);
  data.inventory.health20 = 1; gear.health = 20;
  healthGuide.update(0, gear, data, 15000);
  assert.equal(critical.length, 2); assert.ok(critical[1].includes('Use a health pack'), 'critical health interrupts a cold advisory and points to owned recovery');
  gear.health = 0; healthGuide.update(0, gear, data, 15000);
  assert.equal(critical.length, 3); assert.ok(critical[2].startsWith('Ground Control'), 'death message interrupts health warning');
  healthGuide.reset(); assert.equal(healthGuide.message, '');

  // Construct the actual Game with a tiny DOM/canvas adapter; exercise finish, saves,
  // destination unlocks, crash cleanup and the visible landing hold through real methods.
  const storage = new Map();
  let storageWrites = 0;
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { storageWrites++; storage.set(key, value); } };
  const listeners = () => {
    const callbacks = new Map();
    return { addEventListener(type, callback) { const entries = callbacks.get(type) ?? []; entries.push(callback); callbacks.set(type, entries); }, emit(type, event) { for (const callback of callbacks.get(type) ?? []) callback(event); } };
  };
  const drawContext = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: text.length * 7 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const nodes = new Map();
  const makeNode = (id, tag = 'div') => {
    const node = { ...listeners(), id, value: '', textContent: '', className: '', children: [], hidden: false, disabled: false, inert: false, checked: false,
      style: { setProperty(key, value) { this[key] = value; } }, dataset: {}, tagName: id === 'game' ? 'CANVAS' : tag.toUpperCase(), replacements: 0,
      focus() { document.activeElement = this; }, setAttribute() {}, replaceChildren(...children) { this.replacements++; this.children = children; }, append(...children) { this.children.push(...children); },
      querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child => selector === '*' || (selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : child.tagName === selector.toUpperCase())); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }, getContext: () => drawContext,
      getBoundingClientRect: () => ({ width: 1000, height: 700, left: 0, top: 0 }), setPointerCapture() {} };
    node.classList = { toggle(name, on) { const classes = new Set(node.className.split(' ').filter(Boolean)); if (on) classes.add(name); else classes.delete(name); node.className = [...classes].join(' '); } };
    return node;
  };
  globalThis.window = { ...listeners(), devicePixelRatio: 1 };
  globalThis.document = { ...listeners(), hidden: false, activeElement: null, createElement: tag => makeNode('', tag), getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); } };
  globalThis.requestAnimationFrame = () => 0;
  const { Game } = require('./game.js');
  const game = new Game();
  assert.equal(game.audio.musicMode, 'menu', 'the pilot menu requests the supplied menu loop');
  const effects = [];
  game.audio.effect = effect => effects.push(effect);
  let frameTime = 1000;
  const present = seconds => { for (let i = 0; i < Math.ceil(seconds * 60); i++) game.frame(frameTime += 1000 / 60); };
  const start = () => { storage.clear(); game.ui.slot = 0; game.state = 'menu'; game.saves = new SaveManager(); game.dispatch('new'); assert.equal(game.audio.musicMode, null, 'aiming stays silent until release'); game.sling.setPull(0, -80); game.launch(); };
  start();
  assert.equal(game.audio.musicMode, 'flight', 'releasing the launcher requests flight music');
  game.score.maxAltitude = 15000; game.score.distance = 30000; game.score.duration = 25;
  game.score.coinCents = 200; game.score.platformCents = 500; game.score.scrap = 5;
  const payout = game.score.breakdown().totalCents;
  game.finish();
  assert.equal(game.state, 'results'); assert.equal(game.data.flights, 1);
  assert.equal(game.data.moneyCents, payout); assert.equal(game.data.scrap, 5);
  assert.equal(game.audio.musicMode, 'menu', 'results resume menu music');
  const completed = structuredClone(game.data);
  const writesAfterFinish = storageWrites;
  assert.equal(game.payday.snapshot().moneyCents, 0, 'credited money starts its visual tally at zero');
  assert.deepEqual(game.payday.snapshot().rows.map(row => row.id), ['height', 'time', 'distance', 'scrap']);
  game.frame(frameTime);
  const controls = nodes.get('accessible-controls'), moneyNode = controls.querySelector('.payday-money'), skip = controls.querySelector('.action-skipPayday');
  const replacements = controls.replacements;
  assert.equal(moneyNode.textContent, '$0.00');
  assert.deepEqual(controls.querySelectorAll('DT').map(node => node.textContent), ['Max height', 'Flight time', 'Distance', 'Scrap'], 'the short flight log hides financial breakdown rows');
  assert.equal(controls.querySelectorAll('.payday-money').length, 1, 'only one earned-money counter is shown');
  skip.focus();
  present(0.4);
  const beforePause = game.payday.snapshot(), soundCount = effects.length;
  game.setPaused(true); present(0.5);
  assert.deepEqual(game.payday.snapshot(), beforePause, 'pause freezes visual counters and their sound clock');
  assert.equal(effects.length, soundCount);
  game.setPaused(false);
  document.hidden = true; document.emit('visibilitychange'); present(0.5);
  assert.deepEqual(game.payday.snapshot(), beforePause, 'hidden pages cannot finish a payday offscreen');
  assert.equal(game.audio.musicMode, null, 'hidden pages stop menu music');
  document.hidden = false; document.emit('visibilitychange');
  assert.equal(game.audio.musicMode, 'menu');
  skip.focus();
  present(14);
  assert.equal(game.payday.snapshot().moneyCents, payout);
  assert.equal(moneyNode.textContent, `$${(payout / 100).toFixed(2)}`);
  assert.equal(controls.querySelector('.payday-money'), moneyNode, 'counter updates preserve the existing DOM');
  assert.equal(controls.replacements, replacements, 'counting never rebuilds the results controls');
  assert.equal(document.activeElement, skip, 'finishing a tally does not steal keyboard focus');
  assert.equal(effects.filter(effect => effect === 'paydayComplete').length, 1);
  assert.ok(effects.includes('paydayTick'), 'the actual Game maps the counter to coin sounds');
  assert.equal(storageWrites, writesAfterFinish, 'presentation never writes a second payout or saves each animated value');
  assert.deepEqual(game.data, completed);
  game.finish(); game.finish(true); game.step(1);
  assert.deepEqual(game.data, completed, 'repeated finish/results updates cannot duplicate rewards or unlock another world');
  assert.deepEqual(new SaveManager().slots[0], completed, 'completed flight is persisted once');
  game.dispatch('skipPayday'); present(0.1);
  assert.equal(effects.filter(effect => effect === 'paydayComplete').length, 1, 'skip/revisit cannot replay the final ching');
  game.reset(); assert.equal(game.audio.musicMode, null, 'returning to the slingshot stops menu music');
  game.setPaused(true); assert.equal(game.audio.musicMode, 'menu', 'flight pause requests menu music');
  game.setPaused(false); assert.equal(game.audio.musicMode, null);
  nodes.get('garage').onclick(); assert.equal(game.audio.musicMode, 'menu', 'the garage shares menu music');
  game.dispatch('launch'); assert.equal(game.audio.musicMode, null);
  game.dispatch('menu'); assert.equal(game.audio.musicMode, 'menu');

  start(); game.score.maxAltitude = config.destinations.moon.milestoneFeet;
  game.score.distance = game.score.maxAltitude; game.score.duration = 180; game.score.scrap = 10;
  game.finish(true);
  assert.equal(game.data.tier, 'moon'); assert.equal(game.data.moonReached, true); assert.equal(game.data.marsReached, false);
  assert.ok(game.payday.snapshot().rows.some(row => row.id === 'space'), 'an Earth arrival uses the flown planet threshold after unlocking Moon');
  const lunar = structuredClone(game.data);
  game.finish(true); assert.deepEqual(game.data, lunar, 'one Earth arrival cannot also unlock Mars');
  assert.equal(new SaveManager().slots[0].tier, 'moon', 'Moon unlock persists with the payout');
  game.reset(); game.state = 'flying'; game.score.maxAltitude = config.destinations.mars.milestoneFeet;
  game.finish(true); assert.equal(game.data.marsReached, true); assert.equal(game.data.moonFlights, 1);
  const mars = structuredClone(game.data); game.finish(true); assert.deepEqual(game.data, mars, 'Mars completion pays once');

  start(); game.score.maxAltitude = config.destinations.moon.milestoneFeet;
  game.equipment.health = 0;
  Object.assign(game.equipment, { thrusting: true, upwardThrust: 330, horizontalThrust: 250, fuelDraining: true, oxygenDraining: true, healthDraining: true, coldDamageRate: 4, oxygenDamageRate: 12 });
  game.player.thrustingUp = true; game.crash();
  assert.equal(game.state, 'crashing'); assert.equal(game.failed, true);
  for (const key of ['thrusting', 'fuelDraining', 'oxygenDraining', 'healthDraining']) assert.equal(game.equipment[key], false, `crash clears ${key}`);
  for (const key of ['upwardThrust', 'horizontalThrust', 'coldDamageRate', 'oxygenDamageRate']) assert.equal(game.equipment[key], 0, `crash clears ${key}`);
  assert.equal(game.player.thrustingUp, false);
  game.finish(true); assert.equal(game.data.tier, 'earth'); assert.equal(game.data.moonReached, false, 'dead arrival cannot unlock Moon');
  const retainedPayout = game.score.breakdown().totalCents;
  const paidBeforeSkip = structuredClone(game.data), failedWrites = storageWrites, completionCount = effects.filter(effect => effect === 'paydayComplete').length;
  game.dispatch('skipPayday'); present(0.2);
  assert.equal(game.payday.snapshot().moneyCents, retainedPayout, 'skipped death results show the exact retained payout');
  assert.deepEqual(game.data, paidBeforeSkip); assert.equal(storageWrites, failedWrites);
  assert.equal(effects.filter(effect => effect === 'paydayComplete').length, completionCount, 'skipped counting is silent');

  start(); game.player.reset(config.player.radius); game.player.vx = game.player.vy = 0;
  for (let i = 0; i < 228; i++) game.step(config.physics.fixedStep);
  assert.equal(game.state, 'flying', 'grounded landing stays visible for at least 1.9 seconds');
  for (let i = 0; i < 24; i++) game.step(config.physics.fixedStep);
  assert.equal(game.state, 'results', 'settled landing completes after the configured two-second hold');
  console.log('Playtest regressions passed: payout preservation, paused/hidden payday counters, stable results controls, music state, idempotent rewards/world unlocks, oxygen warnings, crash cleanup and landing hold.');
} finally {
  for (const [key, value] of Object.entries(prior)) globalThis[key] = value;
  if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('trash-panda-playtest-')) fs.rmSync(temporary, { recursive: true, force: true });
}
