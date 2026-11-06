// Animation state/timing checks independent of sprite loading or flight physics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-animation-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { PlayerAnimation, animationClips, animationTiming } = require('./player-animation.js');
  const fixture = () => ({ animation: new PlayerAnimation(), player: { vx: 100, vy: -100, grounded: false }, equipment: { horizontalThrust: 0, upwardThrust: 0, health: 100 } });
  const advance = (f, seconds, options = [], step = 1 / 120) => {
    let remaining = seconds;
    while (remaining > 1e-10) { const dt = Math.min(step, remaining); f.animation.update(dt, f.player, f.equipment, ...options); remaining -= dt; }
    return f.animation;
  };
  assert.equal(Object.keys(animationClips).length, 22);
  for (const [pose, clip] of Object.entries(animationClips)) {
    assert.equal(clip.frames, pose.startsWith('idle') ? 10 : 8, `${pose} has the intended frame count`);
    assert.ok(clip.seconds > 0 && clip.seconds <= 1.6);
  }

  const unfurl = fixture(); unfurl.player.vx = -950; unfurl.player.vy = 950;
  unfurl.animation.updateAiming(3.11).beginLaunch(-1);
  assert.equal(unfurl.animation.pose, 'launch'); assert.equal(unfurl.animation.frameIndex, 0);
  assert.equal(unfurl.animation.previousPose, 'cannonball'); assert.equal(unfurl.animation.previousFrameIndex, 4, 'launch blends from the exact held tuck/blink frame');
  assert.equal(unfurl.animation.facing, -1);
  const launchFrames = new Set([0]);
  for (let i = 0; i < 35; i++) { unfurl.animation.update(1 / 120, unfurl.player, unfurl.equipment); if (unfurl.animation.pose === 'launch') launchFrames.add(unfurl.animation.frameIndex); }
  assert.equal(launchFrames.size, 8, 'the short launch unfurl plays all eight authored poses');
  assert.equal(unfurl.animation.pose, 'idleLeft', 'unpowered launch unfurls into the actual direction of coasting');
  const poweredLaunch = fixture(); poweredLaunch.equipment.horizontalThrust = 250;
  poweredLaunch.animation.beginLaunch(1); advance(poweredLaunch, .3);
  assert.equal(poweredLaunch.animation.pose, 'thrustRight', 'held matching thrust continues directly after launch without replaying another unfurl');
  poweredLaunch.animation.beginLaunch(1); poweredLaunch.equipment.horizontalThrust = -250; advance(poweredLaunch, .3);
  assert.equal(poweredLaunch.animation.pose, 'brakeLeft', 'opposing launch input uses current momentum when the unfurl finishes');
  const interruptedLaunch = fixture(); interruptedLaunch.animation.beginLaunch(1);
  interruptedLaunch.animation.update(.01, interruptedLaunch.player, interruptedLaunch.equipment, false, false, true);
  assert.equal(interruptedLaunch.animation.pose, 'falling', 'impact immediately interrupts the launch artwork');
  advance(interruptedLaunch, .6); assert.notEqual(interruptedLaunch.animation.pose, 'launch', 'an interrupted unfurl never resumes later');
  interruptedLaunch.animation.beginLaunch(1); interruptedLaunch.player.grounded = true; interruptedLaunch.player.vy = interruptedLaunch.player.vx = 0;
  interruptedLaunch.animation.update(.01, interruptedLaunch.player, interruptedLaunch.equipment);
  assert.equal(interruptedLaunch.animation.pose, 'landing', 'a settled ground contact interrupts launch');
  advance(interruptedLaunch, .36); assert.equal(interruptedLaunch.animation.pose, 'standing');
  interruptedLaunch.animation.beginLaunch(-1).reset(); interruptedLaunch.player.grounded = false;
  interruptedLaunch.animation.update(.01, interruptedLaunch.player, interruptedLaunch.equipment);
  assert.equal(interruptedLaunch.animation.pose, 'idleRight', 'reset discards an unfinished launch cue');

  for (const direction of [-1, 1]) {
    const f = fixture(), side = direction < 0 ? 'Left' : 'Right';
    f.player.vx = -direction * 400; f.equipment.horizontalThrust = direction * 250;
    f.animation.update(1 / 120, f.player, f.equipment);
    assert.equal(f.animation.pose, `brake${side}`); assert.equal(f.animation.facing, -direction);
    const brakeFrames = new Set([f.animation.frameIndex]);
    for (let i = 0; i < 120; i++) { f.animation.update(1 / 120, f.player, f.equipment); brakeFrames.add(f.animation.frameIndex); }
    assert.equal(brakeFrames.size, 8, 'all braking frames play before holding the last pose');
    assert.equal(f.animation.frameIndex, 7, 'continued opposing momentum holds the brake pose without restarting');
    f.player.vx = direction * 30;
    f.animation.update(1 / 120, f.player, f.equipment); assert.equal(f.animation.pose, `turn${side}`);
    assert.equal(f.animation.facing, direction);
    advance(f, .26); assert.equal(f.animation.pose, `thrust${side}`);
    advance(f, 2); assert.equal(f.animation.pose, `thrust${side}`, 'completed turns never replay under held thrust');
  }

  const punch = fixture(); punch.equipment.horizontalThrust = 250;
  punch.animation.update(1 / 120, punch.player, punch.equipment); assert.equal(punch.animation.pose, 'punchRight');
  const punchFrames = new Set([punch.animation.frameIndex]);
  for (let i = 0; i < 29; i++) { punch.animation.update(1 / 120, punch.player, punch.equipment); if (punch.animation.pose === 'punchRight') punchFrames.add(punch.animation.frameIndex); }
  assert.equal(punchFrames.size, 8); assert.equal(punch.animation.pose, 'thrustRight');
  punch.equipment.horizontalThrust = 0; punch.equipment.upwardThrust = 330;
  punch.animation.update(1 / 120, punch.player, punch.equipment); assert.equal(punch.animation.pose, 'thrustUp');
  advance(punch, 1); assert.equal(punch.animation.frameIndex, 7, 'upward arms finish drawing inward and remain there');
  advance(punch, 1); assert.equal(punch.animation.frameIndex, 7, 'upward thrust cannot restart every frame');
  punch.equipment.upwardThrust = 0; punch.animation.update(1 / 120, punch.player, punch.equipment);
  assert.equal(punch.animation.pose, 'recovery');
  advance(punch, .27); assert.equal(punch.animation.pose, 'idleRight');
  const boost = fixture(), boostFrames = new Set();
  boost.animation.update(1 / 120, boost.player, boost.equipment, true); boostFrames.add(boost.animation.frameIndex);
  for (let i = 0; i < 40; i++) { boost.animation.update(1 / 120, boost.player, boost.equipment); if (boost.animation.pose === 'thrustUp') boostFrames.add(boost.animation.frameIndex); }
  assert.equal(boostFrames.size, 8, 'a booster without sustained thrust still finishes the complete upward pose');
  assert.equal(boost.animation.pose, 'recovery');

  const contact = fixture(); contact.equipment.horizontalThrust = 250;
  contact.animation.update(1 / 120, contact.player, contact.equipment, false, true);
  assert.equal(contact.animation.pose, 'bounceRight');
  assert.ok(contact.animation.blend < 1, 'airborne contacts use the short visual blend without delaying simulation');
  // A level-style event flag must not restart a contact every update.
  advance(contact, .2, [false, true]);
  assert.equal(contact.animation.pose, 'correctRight', 'powered recovery starts after the 180ms contact, without a long eight-frame lock');
  advance(contact, .24); assert.equal(contact.animation.pose, 'thrustRight');
  contact.animation.update(.01, contact.player, contact.equipment, false, false);
  contact.animation.update(.01, contact.player, contact.equipment, false, true);
  assert.equal(contact.animation.pose, 'bounceRight'); assert.equal(contact.animation.frameIndex, 0, 'a new contact restarts its own clip');
  contact.animation.reset(); contact.player.grounded = false; contact.player.vy = -500;
  contact.animation.update(.01, contact.player, contact.equipment);
  contact.player.grounded = true; contact.player.vy = 80;
  contact.animation.update(.01, contact.player, contact.equipment);
  assert.equal(contact.animation.pose, 'bounceRight'); assert.equal(contact.animation.grounded, false, 'brief upward floor rebound is airborne');
  contact.player.grounded = false; advance(contact, .2);
  assert.notEqual(contact.animation.pose, 'standing', 'brief contacts never show a standing frame in flight');
  contact.player.grounded = true; contact.player.vy = 0; contact.player.vx = 0;
  contact.animation.update(.01, contact.player, contact.equipment);
  assert.equal(contact.animation.pose, 'landing'); assert.equal(contact.animation.grounded, true); assert.equal(contact.animation.blend, 1, 'landing feet never blend against an airborne pivot');
  advance(contact, .36); assert.equal(contact.animation.pose, 'standing');
  advance(contact, 2); assert.equal(contact.animation.pose, 'standing', 'held flight input never restarts a grounded landing');

  const skid = fixture(); skid.player.grounded = true; skid.player.vy = 0; skid.player.vx = 400;
  advance(skid, 1);
  assert.equal(skid.animation.pose, 'landing'); assert.equal(skid.animation.frameIndex, 3, 'fast ground travel holds the planted crouch instead of sliding standing feet');
  skid.player.vx = 0; skid.animation.update(.01, skid.player, skid.equipment);
  assert.equal(skid.animation.frameIndex, 4, 'a stopped skid resumes with the settling half of the landing');
  advance(skid, .18); assert.equal(skid.animation.pose, 'standing', 'settling completes promptly once the ground skid stops');
  skid.player.vx = 400; advance(skid, .2);
  assert.equal(skid.animation.pose, 'landing'); assert.equal(skid.animation.frameIndex, 3, 'new ground motion leaves a standing idle for a braced skid');
  skid.player.grounded = false; skid.player.vy = 500; skid.animation.update(.01, skid.player, skid.equipment);
  assert.notEqual(skid.animation.pose, 'standing');
  skid.player.grounded = true; skid.player.vy = 0; skid.player.vx = 0; skid.animation.update(.01, skid.player, skid.equipment);
  assert.equal(skid.animation.pose, 'landing'); assert.equal(skid.animation.frameIndex, 0, 'a new ground contact starts fresh after leaving a skid');

  // Exercise the real launcher/player contact path: a full pull starts at y=0,
  // so the first upward step briefly reports grounded while emerging at radius.
  const { Player } = require('./player.js'), { Slingshot } = require('./slingshot.js');
  const { Economy } = require('./economy.js'), { freshSave } = require('./saves.js');
  const { World } = require('./world.js'), { FlightEquipment } = require('./flight-equipment.js');
  const { config } = require('./config.js');
  const pilot = freshSave('Fresh full pull'), sling = new Slingshot(new Economy(pilot, () => {}));
  sling.setViewport(1440, 900); sling.setPull(0, -sling.restHeight);
  const launchedPlayer = new Player(), launchWorld = new World(), launchEquipment = new FlightEquipment(pilot), launchAnimation = new PlayerAnimation();
  launchedPlayer.reset(sling.restHeight + sling.pull.y); launchedPlayer.launch(sling.velocity());
  launchAnimation.beginLaunch(launchedPlayer.vx);
  launchedPlayer.step(config.physics.fixedStep, launchWorld);
  assert.equal(launchedPlayer.grounded, true); assert.ok(launchedPlayer.vy > 0);
  launchAnimation.update(config.physics.fixedStep, launchedPlayer, launchEquipment);
  assert.equal(launchAnimation.pose, 'launch', 'a fresh full-power upward launch never masquerades as a floor rebound');
  assert.equal(launchAnimation.grounded, false, 'an emerging launch cannot show landing or standing');
  for (let i = 0; i < 40; i++) { launchedPlayer.step(config.physics.fixedStep, launchWorld); launchAnimation.update(config.physics.fixedStep, launchedPlayer, launchEquipment); }
  launchedPlayer.y = config.player.radius + 1; launchedPlayer.vy = -500; launchedPlayer.grounded = false;
  launchAnimation.update(0, launchedPlayer, launchEquipment);
  launchedPlayer.step(config.physics.fixedStep, launchWorld);
  assert.equal(launchedPlayer.grounded, true); assert.ok(launchedPlayer.vy > 0);
  launchAnimation.update(config.physics.fixedStep, launchedPlayer, launchEquipment);
  assert.ok(launchAnimation.pose.startsWith('bounce'), 'a real descending floor impact still selects its upward rebound reaction');

  const hit = fixture(); hit.equipment.upwardThrust = 330;
  hit.animation.update(.01, hit.player, hit.equipment, false, false, true);
  assert.equal(hit.animation.pose, 'falling', 'a nonlethal impact selects an uncontrolled reaction');
  advance(hit, animationTiming.impactSeconds + .03, [false, false, true]);
  assert.equal(hit.animation.pose, 'thrustUp', 'a held impact flag cannot lock or restart the reaction');
  hit.equipment.health = 0; advance(hit, .6);
  assert.equal(hit.animation.pose, 'falling', 'depleted health keeps uncontrolled falling despite input');
  hit.equipment.health = 100; hit.equipment.upwardThrust = 0;
  advance(hit, .6, [false, false, false, true]); assert.equal(hit.animation.pose, 'falling', 'an explicit crash state also controls the reaction');
  advance(hit, .28); assert.equal(hit.animation.pose, 'idleRight', 'a recovered living flight leaves the reaction through recovery');

  const blend = fixture(); blend.equipment.horizontalThrust = 250;
  blend.animation.update(.03, blend.player, blend.equipment);
  assert.equal(blend.animation.previousPose, 'idleRight'); assert.equal(blend.animation.previousFrameIndex, 0);
  assert.equal(blend.animation.previousFacing, 1, 'crossfade retains the previous pose orientation');
  assert.ok(Math.abs(blend.animation.blend - .5) < 1e-9); advance(blend, .04); assert.equal(blend.animation.blend, 1);
  const pausedFrame = blend.animation.frameIndex; blend.animation.update(0, blend.player, blend.equipment);
  assert.equal(blend.animation.frameIndex, pausedFrame, 'zero elapsed time does not advance a clip');
  const aim = new PlayerAnimation(); aim.updateAiming(3.11); assert.equal(aim.aimingFrame, 4);
  aim.updateAiming(.12); assert.equal(aim.aimingFrame, 0, 'short blink returns to its open-eye hold');
  aim.reset(); assert.equal(aim.aimingFrame, 0);

  for (const rate of [30, 60, 120, 144]) {
    const f = fixture(); f.equipment.horizontalThrust = 250;
    advance(f, 1, [], 1 / rate); assert.equal(f.animation.pose, 'thrustRight', `held thrust finishes its transition at ${rate}Hz`);
    const immutablePlayer = Object.freeze({ ...f.player }), immutableEquipment = Object.freeze({ ...f.equipment });
    f.animation.update(1 / rate, immutablePlayer, immutableEquipment);
    assert.deepEqual(immutablePlayer, f.player); assert.deepEqual(immutableEquipment, f.equipment, 'animation never changes gameplay data');
  }
  console.log('Eight-frame animation checks passed: launch unfurl, reversals, contacts, ground skids/rebounds, impacts, blink, crossfade, and frame-rate independence.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
