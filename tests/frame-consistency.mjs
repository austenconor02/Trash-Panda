// Exercise the production Game.frame scheduler with a memory-only DOM adapter.
// Drawing is suppressed: this verifies simulation scheduling, not browser FPS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-frame-check-'));
const prior = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, localStorage: globalThis.localStorage };
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { Game } = require('./game.js'), { config } = require('./config.js');
  const drawContext = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: text.length * 7 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const nodes = new Map();
  const node = id => ({ id, value: '', hidden: false, disabled: false, inert: false, checked: false, style: { setProperty() {} }, dataset: {}, tagName: id === 'game' ? 'CANVAS' : 'DIV',
    focus() { document.activeElement = this; }, addEventListener() {}, setAttribute() {}, replaceChildren() {}, append() {}, querySelectorAll: () => [], getContext: () => drawContext,
    getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0 }), setPointerCapture() {} });
  globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
  globalThis.document = { addEventListener() {}, hidden: false, activeElement: null, createElement: () => node('button'), getElementById(id) { if (!nodes.has(id)) nodes.set(id, node(id)); return nodes.get(id); } };
  globalThis.requestAnimationFrame = () => 0;
  const results = [];
  for (const hz of [30, 60, 144]) {
    const storage = new Map();
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const game = new Game(); game.dispatch('new');
    Object.assign(game.data.levels, { jetpack: 1, left: 3, right: 3, fuel: 5, engine: 5, efficiency: 3, suit: 3, oxygen: 5 });
    game.world.reset(24680); game.equipment.reset();
    game.player.reset(10000); game.player.vx = 80; game.player.vy = 750; game.state = 'flying';
    game.renderer.draw = () => {}; game.ui.hud = () => {};
    let ticks = 0;
    game.input = { clear() {}, step() {}, controls() { const seconds = ticks++ * config.physics.fixedStep; return { up: seconds % 4 < 2.6, left: seconds % 11 > 9, right: seconds % 13 > 11, boost: false }; } };
    game.lastTime = 1000; game.accumulator = 0;
    for (let frame = 0; frame < hz * 30; frame++) game.frame(1000 + (frame + 1) * 1000 / hz);
    const state = { ticks, position: [game.player.x, game.player.y, game.player.vx, game.player.vy], fuel: game.equipment.fuel, oxygen: game.equipment.oxygen, health: game.equipment.health, score: { ...game.score }, state: game.state };
    results.push({ hz, ...state });
  }
  for (const { hz, ...result } of results.slice(1)) {
    const { hz: firstHz, ...first } = results[0];
    assert.deepEqual(result, first, `${hz} Hz and ${firstHz} Hz production frame scheduling must produce identical gameplay state`);
  }
  assert.equal(results[0].ticks, 3600);
  console.log('Production Game.frame consistency passed at 30/60/144 Hz: identical physics, resources, contacts and scoring over 3,600 steps. Browser rendering performance is not covered.');
} finally {
  for (const [key, value] of Object.entries(prior)) globalThis[key] = value;
  fs.rmSync(temporary, { recursive: true, force: true });
}
