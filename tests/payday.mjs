// Presentation-only payout counters: exact totals, conditional rows, and one-shot sounds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-payday-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  const { outputText } = ts.transpileModule(fs.readFileSync('src/payday.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  fs.writeFileSync(path.join(temporary, 'payday.js'), outputText);
  const require = createRequire(path.join(temporary, 'package.json'));
  const { PaydayTimeline, paydayTiming } = require('./payday.js');
  const input = { maxHeight: 23549.75, flightSeconds: 89.27, distance: 76493.86, spaceSeconds: 0, scrap: 4, totalCents: 46397 };
  const finish = (timeline, dt = 1 / 60) => {
    const events = [];
    const amounts = [];
    while (!timeline.snapshot().complete) {
      const frame = timeline.step(dt);
      amounts.push(frame.moneyCents);
      events.push(...frame.events);
      assert.ok(frame.events.filter(event => event === 'tick').length <= 1, 'one frame never creates an audio backlog');
    }
    return { events, amounts, result: timeline.snapshot() };
  };

  const normal = new PaydayTimeline();
  assert.equal(normal.snapshot().complete, false);
  assert.deepEqual(normal.snapshot().rows, []);
  normal.start(input);
  assert.deepEqual(normal.snapshot().rows.map(row => row.id), ['height', 'time', 'distance', 'scrap']);
  assert.equal(normal.snapshot().moneyCents, 0);
  assert.equal(normal.snapshot().moneyVisible, false);
  assert.ok(normal.snapshot().rows.every(row => !row.visible && row.value === 0));
  const held = normal.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(normal.step(dt), held, 'paused/invalid time cannot advance counters or sounds');
  assert.deepEqual(normal.step(0.1).events, ['boot']);
  normal.step(paydayTiming.rowStart - 0.1 + 0.1);
  assert.equal(normal.snapshot().rows[0].visible, true);
  assert.ok(normal.snapshot().rows[0].value > 0);
  assert.equal(normal.snapshot().rows[1].visible, false, 'rows reveal in order');
  const normalRun = finish(normal);
  assert.equal(normalRun.result.moneyCents, input.totalCents);
  assert.ok(normalRun.amounts.every((amount, i, values) => i === 0 || amount >= values[i - 1]), 'cash only counts upward');
  assert.ok(normalRun.result.rows.every(row => row.complete && row.value === row.target));
  assert.equal(normalRun.result.rows.find(row => row.id === 'time').value, input.flightSeconds);
  assert.ok(normalRun.events.includes('tick'), 'the money tally supplies coin ticks');
  assert.equal(normalRun.events.filter(event => event === 'row').length, 4);
  assert.equal(normalRun.events.filter(event => event === 'complete').length, 1);
  assert.deepEqual(normal.step(5).events, []);
  assert.deepEqual(normal.snapshot().events, [], 'drawing a completed result cannot replay sound');
  assert.ok(normalRun.result.duration > 9 && normalRun.result.duration < 10);

  const space = new PaydayTimeline();
  space.start({ ...input, reachedSpace: true, spaceSeconds: 0.2 });
  assert.deepEqual(space.snapshot().rows.map(row => row.id), ['height', 'time', 'distance', 'space', 'spaceTime', 'scrap']);
  const spaceRun = finish(space);
  assert.equal(spaceRun.result.rows.find(row => row.id === 'spaceTime').value, 0.2, 'a brief visit to space stays visible');
  assert.equal(spaceRun.result.rows.find(row => row.id === 'space').value, 1);
  assert.ok(spaceRun.result.duration > 12 && spaceRun.result.duration < 14);
  space.start({ ...input, spaceSeconds: 61 });
  assert.ok(space.snapshot().rows.some(row => row.id === 'space'), 'measured space time implies reaching space');
  space.start({ ...input, reachedSpace: true });
  assert.ok(space.snapshot().rows.some(row => row.id === 'spaceTime'), 'threshold contact can show zero space time');

  for (const totalCents of [0, 1, 234, Math.floor(734575 * 0.45), Number.MAX_SAFE_INTEGER]) {
    const timeline = new PaydayTimeline();
    timeline.start({ ...input, totalCents });
    const result = finish(timeline).result;
    assert.equal(result.moneyCents, totalCents, 'presentation keeps the exact finalized payout, including retained/death payouts');
    if (totalCents === 0) assert.equal(result.moneyCents, 0);
  }
  const zero = new PaydayTimeline();
  zero.start({ maxHeight: -1, flightSeconds: NaN, distance: Infinity, spaceSeconds: -1, scrap: -4, totalCents: -200 });
  const zeroRun = finish(zero);
  assert.ok(zeroRun.result.rows.every(row => row.value === 0));
  assert.equal(zeroRun.result.moneyCents, 0);
  assert.ok(!zeroRun.events.includes('tick'), 'zero payouts produce no coin backlog');

  const interrupted = new PaydayTimeline();
  interrupted.start(input);
  interrupted.step(1.2);
  const frozen = interrupted.snapshot();
  assert.deepEqual(interrupted.snapshot(), frozen, 'closing or reopening a view only reads presentation state');
  interrupted.skip();
  assert.equal(interrupted.snapshot().moneyCents, input.totalCents);
  assert.deepEqual(interrupted.step(2).events, [], 'skip finishes silently and cannot trigger later sounds');
  interrupted.start({ ...input, totalCents: 17 });
  assert.equal(interrupted.snapshot().moneyCents, 0, 'a new flight explicitly resets the visual count');
  assert.deepEqual(interrupted.step(10).events, ['complete'], 'large deltas yield one completion sound, not accumulated ticks');
  assert.equal(interrupted.snapshot().moneyCents, 17);
  assert.equal(input.totalCents, 46397, 'timeline never mutates the supplied economy data');

  const reduced = new PaydayTimeline();
  reduced.start(input, { reducedMotion: true });
  assert.equal(reduced.snapshot().complete, true);
  assert.equal(reduced.snapshot().bootProgress, 1);
  assert.equal(reduced.snapshot().moneyCents, input.totalCents);
  assert.deepEqual(reduced.step(0).events, []);
  assert.deepEqual(reduced.step(1 / 60).events, ['complete'], 'reduced motion still permits one final ching without animated ticks');
  assert.deepEqual(reduced.step(1 / 60).events, []);

  console.log('Payday presentation checks passed.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
