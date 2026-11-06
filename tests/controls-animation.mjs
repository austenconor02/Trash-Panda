// Mocked control events and animation regressions; no game session or browser starts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-controls-'));
const originalWindow = globalThis.window, originalDocument = globalThis.document;
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { Input } = require('./input.js'), { PlayerSprite } = require('./player-sprite.js');
  const { config } = require('./config.js');
  class Element {
    handlers = new Map(); captures = new Set(); children = []; dataset = {}; hidden = false; disabled = false;
    addEventListener(name, callback) { const callbacks = this.handlers.get(name) ?? []; callbacks.push(callback); this.handlers.set(name, callbacks); }
    emit(name, event = {}) { for (const callback of this.handlers.get(name) ?? []) callback({ preventDefault() {}, target: this, ...event }); }
    append(child) { this.children.push(child); child.parentElement = this; }
    setAttribute() {}
    focus() {}
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; }
  }
  const page = new Element(); page.createElement = () => new Element(); page.hidden = false;
  globalThis.window = new Element(); globalThis.document = page;
  const canvas = new Element(); canvas.tagName = 'CANVAS'; canvas.ownerDocument = page; new Element().append(canvas);
  let aiming = true, launched = 0;
  const sling = { restHeight: 100, pull: { x: 0, y: 0 }, setPull(x, y) { this.pull = { x, y }; }, reset() { this.pull = { x: 0, y: 0 }; } };
  const input = new Input(canvas, { toWorld: (x, y) => ({ x, y }) }, { x: 0, y: 100 }, sling, () => aiming, () => !aiming,
    () => { launched++; aiming = false; input.finishLaunch(); }, () => {});
  const key = (type, value, extra = {}) => window.emit(type, { key: value, code: value === ' ' ? 'Space' : value, target: canvas, repeat: false, ...extra });
  key('keyup', 'ArrowDown'); assert.equal(launched, 0, 'unmatched key release cannot launch');
  key('keydown', 'ArrowDown', { target: { tagName: 'INPUT' } }); key('keyup', 'ArrowDown');
  assert.equal(launched, 0, 'editing a field cannot launch the game');
  key('keydown', 'ArrowDown'); input.step(0.5); assert.ok(Math.abs(sling.pull.y + sling.restHeight / config.launcher.keyboardFullChargeSeconds * .5) < 1e-9);
  input.clear(); assert.deepEqual(sling.pull, { x: 0, y: 0 }, 'pause/reset cancels a partially charged keyboard launch');
  key('keyup', 'ArrowDown'); assert.equal(launched, 0, 'canceled charge cannot launch later');
  for (const height of [110, 220, 630, 1008]) {
    sling.restHeight = height;
    key('keydown', 'ArrowDown'); input.step(.55);
    assert.ok(Math.abs(sling.pull.y / height + .5) < 1e-9, 'half-second keyboard charge yields half power at every launcher height');
    input.step(.55); assert.ok(Math.abs(sling.pull.y / height + 1) < 1e-9, 'full charge always takes 1.1 seconds');
    input.clear(); key('keyup', 'ArrowDown');
    key('keydown', 'ArrowDown'); key('keydown', 'ArrowRight'); input.step(.55);
    assert.ok(Math.abs(sling.pull.x / height - .45) < 1e-9, 'side aiming preserves the same angle at upgraded heights');
    input.clear(); key('keyup', 'ArrowDown'); key('keyup', 'ArrowRight');
  }
  assert.equal(launched, 0); sling.restHeight = 100;
  canvas.emit('pointerdown', { clientX: 0, clientY: 100, pointerType: 'touch', pointerId: 10 });
  canvas.emit('pointermove', { clientX: -1000, clientY: 1500, pointerId: 10 });
  assert.deepEqual(sling.pull, { x: -1000, y: 1400 }, 'dragging stays unrestricted');
  canvas.emit('pointercancel', { pointerId: 99 }); assert.equal(input.dragging, true, 'an unrelated finger cannot cancel the captured launch drag');
  key('keydown', 'ArrowDown'); input.step(1);
  assert.deepEqual(sling.pull, { x: -1000, y: 1400 }, 'keyboard charge cannot alter a pointer drag');
  canvas.emit('pointercancel', { pointerId: 10 }); assert.equal(canvas.captures.size, 0);
  assert.deepEqual(sling.pull, { x: 0, y: 0 }, 'cancel returns the pouch to rest');
  key('keyup', 'ArrowDown'); assert.equal(launched, 0);
  key('keydown', 'ArrowDown'); input.step(0.5); key('keyup', 'ArrowDown'); assert.equal(launched, 1);
  const toolbar = canvas.parentElement.children.find(child => child.id === 'touch-flight-controls');
  assert.equal(toolbar.children.length, 9, 'touch controls cover sustained and consumable flight actions');
  const button = name => toolbar.children.find(child => child.dataset.control === name);
  button('left').emit('pointerdown', { pointerId: 11 }); button('up').emit('pointerdown', { pointerId: 12 });
  assert.ok(input.controls().left && input.controls().up, 'simultaneous touch pointers combine steering and upward thrust');
  button('up').emit('pointercancel', { pointerId: 12 }); assert.equal(input.controls().up, false);
  assert.equal(input.controls().left, true, 'canceling one finger preserves another held control');
  button('boost').emit('pointerdown', { pointerId: 13 }); assert.equal(input.controls().boost, true); assert.equal(input.controls().boost, false, 'a held consumable fires once');
  button('health50').emit('pointerdown', { pointerId: 14 }); assert.equal(input.controls().healthPack, 'health50');
  page.hidden = true; page.emit('visibilitychange'); assert.equal(input.controls().left, false);
  assert.ok(toolbar.children.every(child => child.captures.size === 0), 'hiding the page releases all captured touch buttons');
  page.hidden = false;
  key('keydown', ' '); window.emit('blur'); assert.equal(input.controls().up, false, 'focus loss releases keyboard thrust');

  const { deployables } = require('./deployables.js');
  const activated = controls => [controls.boost && 'boost', controls.boots && 'boots', controls.teleport && 'teleport', controls.healthPack].filter(Boolean);
  assert.deepEqual(deployables.map(item => item.key), ['1','2','3','4','5','6']);
  for (const item of deployables) {
    input.clear();
    assert.equal(button(item.action).dataset.item, item.item, 'the tap slot and number key address the same saved stock');
    assert.equal(button(item.action).dataset.key, item.key);
    key('keydown', item.key, { code: `Digit${item.key}` });
    assert.deepEqual(activated(input.controls()), [item.action], `number ${item.key} queues exactly its deployable`);
    assert.deepEqual(activated(input.controls()), [], 'reading controls consumes the queued activation once');
    key('keydown', item.key, { code: `Digit${item.key}`, repeat: true });
    assert.deepEqual(activated(input.controls()), [], 'OS keyboard repeat cannot spend another item');
    key('keydown', item.key, { code: `Digit${item.key}`, repeat: false });
    assert.deepEqual(activated(input.controls()), [], 'duplicate held-key events cannot spend another item');
    key('keyup', item.key, { code: `Digit${item.key}` });
    key('keydown', item.key, { code: `Digit${item.key}` });
    assert.deepEqual(activated(input.controls()), [item.action], 'a second deliberate press may activate another item');
    input.clear();
    key('keydown', item.key, { code: `Numpad${item.key}` });
    assert.deepEqual(activated(input.controls()), [item.action], 'numeric keypad mirrors the HUD shortcuts');
    input.clear();
    key('keydown', item.key, { code: `Digit${item.key}`, target: { tagName: 'INPUT' } });
    assert.deepEqual(activated(input.controls()), [], 'typing numbers into a field never deploys equipment');
  }
  input.clear();key('keydown', '!', { code:'Digit1' });assert.equal(input.controls().boost,true,'physical digit shortcuts still work with Shift');
  input.clear();key('keydown','3');input.clear();assert.deepEqual(activated(input.controls()),[],'pause/reset clears queued number-key deployables');
  for (const [alias, action] of [['ArrowUp','boost'],['ArrowDown','boots'],['t','teleport']]) {
    input.clear();key('keydown',alias);assert.deepEqual(activated(input.controls()),[action],'existing deployment aliases remain available');
  }
  input.clear();aiming=true;
  for (const item of deployables) { key('keydown',item.key);key('keyup',item.key); }
  assert.deepEqual(activated(input.controls()),[],'number shortcuts do not spend equipment before release');
  aiming=false;input.clear();
  button('boost').emit('pointerdown',{pointerId:21,pointerType:'mouse',button:0});assert.equal(input.controls().boost,true,'desktop clicks activate HUD deployables');
  button('boost').emit('pointerdown',{pointerId:21,pointerType:'mouse',button:0});assert.equal(input.controls().boost,false,'one captured pointer cannot activate repeatedly');
  button('boost').emit('click',{detail:1});assert.equal(input.controls().boost,false,'the following mouse click cannot double-spend the pointer activation');
  button('boost').emit('pointerup',{pointerId:21});
  button('teleport').emit('click',{detail:0});assert.equal(input.controls().teleport,true,'keyboard-generated button activation works for accessible controls');
  button('boost').emit('pointerdown',{pointerId:22,pointerType:'mouse',button:2});assert.equal(input.controls().boost,false,'secondary clicks do not spend a deployable');
  button('boots').disabled=true;button('boots').emit('pointerdown',{pointerId:23,pointerType:'touch'});assert.equal(input.controls().boots,false,'disabled deployables do not activate');button('boots').disabled=false;
  button('health75').hidden=true;button('health75').emit('pointerdown',{pointerId:24,pointerType:'touch'});assert.equal(input.controls().healthPack,undefined,'hidden empty slots cannot activate');button('health75').hidden=false;
  input.clear();

  const sprite = new PlayerSprite(); sprite.reset();
  const player = { vx: 100, vy: -100, grounded: false }, equipment = { horizontalThrust: 250, upwardThrust: 0 };
  const tick = (seconds, bounce = false) => sprite.update(seconds, player, equipment, false, bounce);
  tick(1 / 120); assert.equal(sprite.pose, 'punchRight', 'falling ignition starts a punch');
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'thrustRight', 'punch finishes while thrust remains held');
  equipment.horizontalThrust = -250; tick(1 / 120); assert.equal(sprite.pose, 'brakeLeft');
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'brakeLeft'); assert.equal(sprite.frameIndex, 7, 'braking holds its eighth frame until opposing momentum ends');
  player.vx = -30; tick(1 / 120); assert.equal(sprite.pose, 'turnLeft');
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'thrustLeft');
  equipment.horizontalThrust = 0; equipment.upwardThrust = 330; tick(1 / 120); assert.equal(sprite.pose, 'thrustUp');
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.frameIndex, 7, 'upward arms complete their eight-frame inward motion');
  equipment.upwardThrust = 0; tick(1 / 120); assert.equal(sprite.pose, 'recovery');
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'idleLeft');
  tick(1 / 120, true); assert.equal(sprite.pose, 'bounceLeft');
  for (let i = 0; i < 24; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'recovery'); equipment.horizontalThrust = -250; tick(1 / 120); assert.equal(sprite.pose, 'correctLeft', 'recovery can transition into directional correction');
  player.grounded = true; player.vy = 0; sprite.update(1 / 120, player, equipment, false, false, false); assert.equal(sprite.pose, 'landing', 'equipped suits still land');
  player.vx = 0;
  for (let i = 0; i < 60; i++) tick(1 / 120);
  assert.equal(sprite.pose, 'standing', 'held input cannot restart a grounded landing');
  const frame = { x: 0, y: 0, width: 60, height: 40, scale: 1, image: {} };
  sprite.frames.set('standing', Array(8).fill(frame)); sprite.frameIndex = 0;
  let destination;
  const context = { drawImage(...args) { destination = args.slice(5); }, save() {}, restore() {}, translate() {}, scale() {}, globalAlpha: 1 };
  sprite.draw(context, 100, 200, false); assert.equal(destination[1] + destination[3], 200 + config.player.radius, 'grounded feet remain on the ground plane');
  player.grounded = false; player.vx = -30; equipment.horizontalThrust = equipment.upwardThrust = 0;
  sprite.reset(); tick(1 / 120); sprite.frames.set('idleLeft', Array(10).fill(frame)); sprite.draw(context, 100, 200, false);
  assert.equal(destination[1] + destination[3] / 2, 200, 'airborne artwork stays centered when pose dimensions change');
  sprite.reset(); sprite.update(.01, player, equipment, false, false, true, true);
  assert.equal(sprite.pose, 'falling', 'the sprite adapter forwards impact events into the reaction clip');
  console.log('Control and animation regressions passed (six deployable number keys, one-shot taps/clicks, aliases, keyboard charge, pointer cancel, multi-touch, reversals, recovery, landing pivots).');
} finally {
  globalThis.window = originalWindow; globalThis.document = originalDocument;
  fs.rmSync(temporary, { recursive: true, force: true });
}
