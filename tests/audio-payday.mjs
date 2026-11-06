// Music routing and bounded, cleaned-up payday sounds without browser audio output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-audio-'));
const previous = Object.fromEntries(['Audio', 'AudioContext', 'BroadcastChannel', 'document', 'window', 'localStorage', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
const timers = new Map();
let timerId = 0;
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const checkExclusive = () => assert.ok(FakeAudio.instances.filter(track => !track.paused && track.volume > 0).length <= 1, 'menu and flight must never be audible together');
const stepTimers = () => {
  for (const id of [...timers.keys()]) {
    const callback = timers.get(id);
    if (!callback) continue;
    timers.delete(id); callback(); checkExclusive();
  }
};
const flushTimers = async () => {
  for (let pass = 0; pass < 40; pass++) {
    await settle();
    if (!timers.size) return;
    stepTimers();
  }
  assert.fail('audio fades finish instead of scheduling indefinitely');
};

class FakeAudio {
  static instances = [];
  static nextPlay = null;
  constructor() { this._src = ''; this.sources = []; this.paused = true; this._volume = 1; this.currentTime = 0; this.playCalls = 0; this.pauseCalls = 0; FakeAudio.instances.push(this); }
  get src() { return this._src; }
  set src(value) { assert.equal(this.volume,0,'sources switch only at silence'); assert.equal(this.paused,true,'outgoing source pauses before switching'); this._src=value; this.sources.push(value); this.currentTime=0; this.paused=true; }
  get volume() { return this._volume; }
  set volume(value) { this._volume = value; checkExclusive(); }
  play() {
    this.playCalls++; this.paused = false; checkExclusive();
    const next = FakeAudio.nextPlay; FakeAudio.nextPlay = null;
    return next ? next(this) : Promise.resolve();
  }
  pause() { this.paused = true; this.pauseCalls++; }
}
class FakeParam {
  value = 1;
  events = [];
  setValueAtTime(value, at) { this.events.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.events.push(['linear', value, at]); }
  exponentialRampToValueAtTime(value, at) { this.events.push(['exponential', value, at]); }
}
class FakeGain {
  gain = new FakeParam();
  disconnected = false;
  connect(target) { this.connected = target; }
  disconnect() { this.disconnected = true; }
}
class FakeOscillator {
  frequency = new FakeParam();
  disconnected = false;
  connect(target) { this.connected = target; }
  disconnect() { this.disconnected = true; }
  start(at) { this.started = at; }
  stop(at) { this.stopped = at; }
  end() { this.onended?.(); this.onended = null; }
}
class FakeContext {
  static instances = [];
  currentTime = 10;
  destination = {};
  oscillators = [];
  gains = [];
  constructor() { FakeContext.instances.push(this); }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createOscillator() { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
  resume() { return Promise.resolve(); }
}

try {
  globalThis.Audio = FakeAudio;
  globalThis.AudioContext = FakeContext;
  globalThis.document = { visibilityState: 'visible' };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  const { outputText } = ts.transpileModule(fs.readFileSync('src/audio.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  fs.writeFileSync(path.join(temporary, 'audio.js'), outputText);
  const { GameAudio } = createRequire(path.join(temporary, 'package.json'))('./audio.js');
  const audio = new GameAudio();

  audio.setMusicMode('menu');
  assert.equal(FakeAudio.instances.length,0,'a menu never starts before a gesture');
  audio.unlock(); await flushTimers();
  const track=FakeAudio.instances[0],context=FakeContext.instances[0];
  assert.equal(track.src,'/audio/garage-idle.mp3'); assert.equal(track.loop,true); assert.equal(track.volume,.35);
  track.currentTime=37;
  audio.set('effectsMuted',true); assert.equal(track.volume,.35,'effects remain independent');
  audio.set('master',.4);audio.set('music',.25);assert.equal(track.volume,.1);
  audio.set('musicMuted',true);await flushTimers();assert.equal(track.paused,true);assert.equal(track.volume,0);
  audio.set('musicMuted',false);await flushTimers();assert.equal(track.currentTime,37);assert.equal(track.paused,false);
  audio.setMusicMode(null);assert.equal(track.paused,false,'leaving the menu trails out');await flushTimers();
  assert.equal(track.volume,0);assert.equal(track.paused,true);
  audio.unlock();await flushTimers();assert.equal(track.paused,true,'charging gestures cannot start music');
  audio.setMusicMode('menu');await flushTimers();
  document.visibilityState='hidden';audio.setMusicMode('menu');await flushTimers();assert.equal(track.paused,true);
  document.visibilityState='visible';audio.setMusicMode('menu');await flushTimers();
  audio.set('masterMuted',true);await flushTimers();assert.equal(track.paused,true);
  audio.set('masterMuted',false);await flushTimers();
  audio.setMusicMode('flight');
  for(let i=0;i<4;i++){stepTimers();audio.setMusicMode('flight');}
  assert.equal(track.src,'/audio/garage-idle.mp3','the incoming source waits for the outgoing fade');
  assert.ok(track.volume>0&&track.volume<.1);
  await flushTimers();assert.equal(track.src,'/audio/flight-tick-tock.mp3');assert.equal(track.paused,false);assert.equal(track.volume,.1);
  assert.equal(FakeAudio.instances.length,1,'menu and flight physically share one audio element');
  track.currentTime=93;
  audio.setMusicMode('menu');await flushTimers();assert.equal(track.currentTime,37,'menu position survives a source switch');
  audio.setMusicMode('flight');await flushTimers();assert.equal(track.currentTime,93,'flight resumes at its saved position');
  audio.set('music',0);await flushTimers();assert.equal(track.paused,true);
  audio.set('music',.25);await flushTimers();assert.equal(track.src,'/audio/flight-tick-tock.mp3');assert.equal(track.paused,false);
  audio.setMusicMode('menu');
  const obsoleteFade=[...timers.values()][0];stepTimers();audio.setMusicMode('flight');
  const beforeStale=track.volume;obsoleteFade();assert.equal(track.volume,beforeStale,'a queued obsolete fade cannot change the active transition');
  await flushTimers();assert.equal(track.src,'/audio/flight-tick-tock.mp3');
  for(let i=0;i<12;i++){audio.setMusicMode('menu');stepTimers();audio.setMusicMode('flight');stepTimers();}
  await flushTimers();assert.equal(track.src,'/audio/flight-tick-tock.mp3');assert.equal(track.paused,false);
  audio.setMusicMode('menu');stepTimers();audio.setMusicMode(null);await flushTimers();assert.equal(track.paused,true,'aiming cancels pending menu music');
  audio.setMusicMode('menu');await flushTimers();audio.setMusicMode('flight');stepTimers();audio.setMusicMode(null);await flushTimers();assert.equal(track.paused,true,'aiming cancels pending flight music');
  let resolvePlay;
  FakeAudio.nextPlay=()=>new Promise(resolve=>{resolvePlay=resolve;});
  const previousPlays=track.playCalls;
  audio.setMusicMode('menu');audio.setMusicMode('menu');audio.unlock();
  assert.equal(track.playCalls,previousPlays+1,'pending requests never duplicate playback');
  audio.setMusicMode(null);await flushTimers();resolvePlay();await settle();assert.equal(track.paused,true,'late playback cannot restart music while aiming');
  FakeAudio.nextPlay=element=>{element.paused=true;return Promise.reject(new Error('autoplay blocked'));};
  audio.setMusicMode('menu');await flushTimers();assert.equal(track.volume,0);assert.equal(track.paused,true);
  audio.unlock();await flushTimers();assert.equal(track.paused,false,'a later gesture retries blocked playback');
  audio.setMusicMode(null);await flushTimers();
  FakeAudio.nextPlay=()=>{throw Error('synchronous autoplay block');};audio.setMusicMode('menu');await flushTimers();assert.equal(track.paused,true);
  audio.unlock();await flushTimers();assert.equal(track.paused,false);

  audio.set('effectsMuted', false);
  audio.effect('paydayTick');
  const firstTick = context.oscillators.length;
  assert.equal(firstTick, 3, 'coin ticks ring with metallic partials');
  for (let i = 0; i < 100; i++) audio.effect('paydayTick');
  assert.equal(context.oscillators.length, firstTick, 'counting updates cannot flood the audio graph');
  context.currentTime += 0.05; audio.effect('paydayTick');
  assert.notEqual(context.oscillators[0].frequency.events[0][1], context.oscillators[3].frequency.events[0][1], 'coin stacks vary their pitch');
  audio.effect('paydayRow'); audio.effect('paydayComplete'); audio.effect('tabletBoot');
  for (const oscillator of context.oscillators) {
    assert.ok(oscillator.stopped > oscillator.started && oscillator.stopped - context.currentTime < 1, 'payday voices have short, scheduled endings');
    oscillator.end();
    assert.equal(oscillator.disconnected, true);
    assert.equal(oscillator.connected.disconnected, true, 'ended envelopes disconnect as well');
  }
  const beforeMuted = context.oscillators.length;
  audio.set('effectsMuted', true); audio.effect('paydayComplete');
  assert.equal(context.oscillators.length, beforeMuted);
  audio.set('effectsMuted', false);
  const beforeFlood = context.oscillators.length;
  for (let i = 0; i < 100; i++) audio.effect('paydayComplete');
  assert.equal(context.oscillators.length - beforeFlood, 64, 'all effects share a bounded voice budget');
  for (const oscillator of context.oscillators.slice(beforeFlood)) oscillator.end();
  audio.effect('coin'); assert.equal(context.oscillators.length - beforeFlood, 65, 'voice slots become available after cleanup');
  assert.equal(new GameAudio().settings.music, 0.25, 'music preferences persist');
  assert.equal(track.paused,true,'a replacement audio controller retires the previous soundtrack');
  audio.unlock();audio.setMusicMode('flight');await flushTimers();assert.equal(track.paused,true,'retired controllers cannot restart their music');
  const listeners=new Map(),channels=[];
  globalThis.window={addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:(name)=>listeners.delete(name),BroadcastChannel:class {}};
  const NativeChannel=globalThis.BroadcastChannel;
  globalThis.BroadcastChannel=class {constructor(){channels.push(this);}postMessage(value){this.sent=value;}close(){this.closed=true;}};
  const replacement=new GameAudio();replacement.setMusicMode('menu');replacement.unlock();await flushTimers();
  const replacementTrack=FakeAudio.instances.at(-1);assert.equal(replacementTrack.paused,false);
  channels[0].onmessage({data:'claim'});assert.equal(replacementTrack.paused,true,'another tab takes exclusive music ownership');
  replacement.setMusicMode('flight');await flushTimers();assert.equal(replacementTrack.paused,true,'background state changes cannot reclaim the music');
  listeners.get('focus')();await flushTimers();assert.equal(replacementTrack.paused,false);assert.equal(replacementTrack.src,'/audio/flight-tick-tock.mp3');
  listeners.get('pagehide')();assert.equal(replacementTrack.paused,true,'leaving the page stops audio immediately');
  replacement.dispose();assert.equal(channels[0].closed,true);
  globalThis.BroadcastChannel=NativeChannel;
  audio.setMusicMode(null); await flushTimers();
  console.log('Audio payday checks passed: exclusive music handoffs, aiming silence, music controls, autoplay races, coin layers, and node cleanup.');
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
