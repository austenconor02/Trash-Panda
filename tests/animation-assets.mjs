// Anatomy registration and atlas checks; performs image reads only, never edits assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-animation-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of ['config', 'sprite-geometry', 'atlas-extraction', 'player-animation-assets'].filter(file => fs.existsSync(`src/${file}.ts`))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(`src/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, `${file}.js`), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { buildSpriteFrame } = require('./sprite-geometry.js');
  const { extractAtlasRow } = require('./atlas-extraction.js');
  const displayHeadSize = require('./config.js').config.playerVisuals.headSize;
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
  const cell = { x: 512, y: 1024, width: 512, height: 512 };
  const anatomy = { headWidth: 0.25, pivot: [0.5, 0.6], floor: 0.9 };
  const compact = buildSpriteFrame(cell, { x: 160, y: 80, width: 220, height: 360 }, anatomy, 26);
  const tailExtended = buildSpriteFrame(cell, { x: 20, y: 80, width: 470, height: 360 }, anatomy, 26);
  const handsExtended = buildSpriteFrame(cell, { x: 20, y: 20, width: 470, height: 470 }, anatomy, 26);
  for (const frame of [compact, tailExtended, handsExtended]) {
    near(frame.scale * anatomy.headWidth * cell.width, 26, 'anatomical head width stays constant');
    near((frame.crop.x - cell.x) * frame.scale + frame.pivotX, anatomy.pivot[0] * cell.width * frame.scale, 'cropping cannot move body root horizontally');
    near((frame.crop.y - cell.y) * frame.scale + frame.pivotY, anatomy.pivot[1] * cell.height * frame.scale, 'cropping cannot move body root vertically');
    near((frame.crop.y - cell.y) * frame.scale + frame.floorY, anatomy.floor * cell.height * frame.scale, 'cropping cannot move the planted foot plane');
  }
  assert.equal(compact.scale, tailExtended.scale, 'extended tail does not shrink the body');
  assert.equal(compact.scale, handsExtended.scale, 'extended fingers do not shrink the body');
  assert.ok(tailExtended.drawWidth > compact.drawWidth, 'padding preserves the wider silhouette');
  const doubleResolution = buildSpriteFrame({ x: 0, y: 0, width: 1024, height: 1024 }, { x: 320, y: 160, width: 440, height: 720 }, anatomy, 26);
  near(doubleResolution.drawWidth, compact.drawWidth, 'source resolution cannot change displayed body size');
  near(doubleResolution.drawHeight, compact.drawHeight, 'source resolution cannot change displayed body height');
  near(doubleResolution.pivotX, compact.pivotX, 'source resolution cannot change displayed root');
  const clipped = buildSpriteFrame(cell, { x: -2, y: -2, width: 516, height: 516 }, anatomy, 26);
  assert.deepEqual(clipped.crop, cell, 'crop cannot sample neighboring cells');
  assert.equal(buildSpriteFrame(cell, { x: 200, y: 120, width: 80, height: 90 }, { headWidth: 0.25, pivot: [0.5, 0.6] }, 26).floorY, undefined, 'airborne poses do not invent a grounded floor');
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => buildSpriteFrame(cell, { x: 0, y: 0, width: 512, height: 512 }, { ...anatomy, headWidth: invalid }, 26), RangeError);
  assert.throws(() => buildSpriteFrame(cell, { x: 600, y: 0, width: 1, height: 1 }, anatomy, 26), RangeError);
  assert.throws(() => buildSpriteFrame(cell, { x: 0, y: 0, width: 10, height: 10 }, { ...anatomy, pivot: [-0.1, 0.5] }, 26), RangeError);
  assert.throws(() => buildSpriteFrame(cell, { x: 0, y: 0, width: 10, height: 10 }, { ...anatomy, floor: 1.1 }, 26), RangeError);

  const synthetic = new Uint8ClampedArray(240 * 100 * 4);
  const ink = (left, top, right, bottom) => { for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) synthetic[(y * 240 + x) * 4 + 3] = 255; };
  ink(60, 25, 130, 80); // First hand crosses the nominal seam at x=120.
  ink(155, 20, 220, 80);
  ink(137, 50, 140, 55); // Detached fingertip, near first body's extended hand.
  ink(0, 4, 239, 4); // Thin guide line must never become a body or enlarge a crop.
  const extracted = extractAtlasRow(synthetic, 240, 100, 0, 1, 2);
  assert.equal(extracted.length, 2);
  assert.ok(extracted[0].x <= 58 && extracted[0].x + extracted[0].width >= 143, 'full-row extraction preserves a cross-seam hand and detached fingertip');
  assert.ok(extracted[0].y > 4, 'guide lines are excluded');
  assert.ok(extracted[0].x + extracted[0].width <= extracted[1].x, 'neighbor source frames do not overlap');
  assert.throws(() => extractAtlasRow(new Uint8ClampedArray(400), 10, 10, 0, 1), /expected 8/, 'missing figures are reported instead of cutting arbitrary cells');

  // Decode the generated PNG's alpha without browser state, optional libraries, or
  // image conversion. Generated atlas exports are non-interlaced 8-bit RGB/RGBA.
  function readPngAlpha(filename) {
    const png = fs.readFileSync(filename);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filename}: valid PNG`);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), depth = png[24], type = png[25], interlace = png[28];
    assert.equal(depth, 8, `${filename}: expected 8-bit export`); assert.equal(interlace, 0, `${filename}: expected non-interlaced export`);
    assert.ok([2, 6].includes(type), `${filename}: expected RGB or RGBA export`);
    const channels = type === 6 ? 4 : 3, rowBytes = width * channels, chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset), name = png.toString('ascii', offset + 4, offset + 8);
      if (name === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), decoded = new Uint8Array(height * rowBytes), alpha = new Uint8Array(width * height);
    const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (rowBytes + 1)]; assert.ok(filter <= 4, 'valid PNG filter');
      for (let x = 0; x < rowBytes; x++) {
        const i = y * rowBytes + x, left = x >= channels ? decoded[i - channels] : 0, up = y ? decoded[i - rowBytes] : 0, corner = y && x >= channels ? decoded[i - rowBytes - channels] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, corner);
        decoded[i] = raw[y * (rowBytes + 1) + x + 1] + predictor;
      }
      for (let x = 0; x < width; x++) alpha[y * width + x] = channels === 4 ? decoded[y * rowBytes + x * channels + 3] : 255;
    }
    const rgba = channels === 4 ? new Uint8ClampedArray(decoded) : new Uint8ClampedArray(width * height * 4);
    if (channels === 3) for (let i = 0; i < width * height; i++) { rgba[i * 4] = decoded[i * 3]; rgba[i * 4 + 1] = decoded[i * 3 + 1]; rgba[i * 4 + 2] = decoded[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    return { width, height, alpha, rgba };
  }
  let checkedFrames = 0, checkedClips = 0;
  if (fs.existsSync('src/player-animation-assets.ts')) {
    const { playerAtlases } = require('./player-animation-assets.js');
    const poses = new Set();
    for (const atlas of playerAtlases) {
      assert.ok([4, 8, 10].includes(atlas.columns), `${atlas.src}: supported four-, eight- or ten-column atlas`);
      assert.ok(Number.isInteger(atlas.rows) && atlas.rows > 0, `${atlas.src}: valid row count`);
      const filename = path.join('public', atlas.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(filename), `${atlas.src}: committed atlas exists`);
      const image = readPngAlpha(filename);
      const extractedRows = new Map();
      for (const clip of atlas.clips) {
        assert.equal(clip.frameCount, ['idleLeft', 'idleRight'].includes(clip.pose) ? 10 : 8, `${clip.pose}: intended indexed frame count`);
        assert.ok(clip.row + Math.ceil(clip.frameCount / atlas.columns) <= atlas.rows, `${clip.pose}: every indexed frame has a source row and column`);
        assert.ok(Number.isInteger(clip.row) && clip.row >= 0 && clip.row < atlas.rows, `${clip.pose}: valid row`);
        assert.ok(!poses.has(clip.pose), `${clip.pose}: one authoritative asset source`); poses.add(clip.pose);
        for (let index = 0; index < clip.frameCount; index++) {
          const sourceRow = clip.row + Math.floor(index / atlas.columns), sourceColumn = index % atlas.columns;
          if (!extractedRows.has(sourceRow)) extractedRows.set(sourceRow, extractAtlasRow(image.rgba, image.width, image.height, sourceRow, atlas.rows, atlas.columns));
          const sources = extractedRows.get(sourceRow);
          const x = Math.floor(sourceColumn * image.width / atlas.columns), y = Math.floor(sourceRow * image.height / atlas.rows);
          const cellWidth = Math.floor((sourceColumn + 1) * image.width / atlas.columns) - x, cellHeight = Math.floor((sourceRow + 1) * image.height / atlas.rows) - y;
          const frameCell = { x, y, width: cellWidth, height: cellHeight };
          const headWidth = Array.isArray(clip.headWidth) ? clip.headWidth[index] : clip.headWidth;
          const pivot = Array.isArray(clip.pivot[0]) ? clip.pivot[index] : clip.pivot;
          const floor = Array.isArray(clip.floor) ? clip.floor[index] : clip.floor;
          if (Array.isArray(clip.headWidth)) assert.equal(clip.headWidth.length, clip.frameCount);
          if (Array.isArray(clip.pivot[0])) assert.equal(clip.pivot.length, clip.frameCount);
          if (Array.isArray(clip.floor)) assert.equal(clip.floor.length, clip.frameCount);
          const source = sources[sourceColumn], expanded = { x: Math.min(frameCell.x, source.x), y: Math.min(frameCell.y, source.y), width: 0, height: 0 };
          expanded.width = Math.max(frameCell.x + cellWidth, source.x + source.width) - expanded.x;
          expanded.height = Math.max(frameCell.y + cellHeight, source.y + source.height) - expanded.y;
          let left = source.width, top = source.height, right = -1, bottom = -1, transparent = 0, opaque = 0;
          for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
            const a = image.alpha[(source.y + y) * image.width + source.x + x];
            if (a < 8) transparent++;
            if (a >= 128) { opaque++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
          }
          assert.ok(opaque > cellWidth * cellHeight * 0.005, `${clip.pose}[${index}]: nonempty artwork`);
          assert.ok(transparent > source.width * source.height * 0.1, `${clip.pose}[${index}]: real transparent padding`);
          assert.ok(left >= 2 && top >= 2 && right < source.width - 2 && bottom < source.height - 2, `${clip.pose}[${index}]: complete figure clears extracted source edges`);
          if (sourceColumn) assert.ok(sources[sourceColumn - 1].x + sources[sourceColumn - 1].width <= source.x, `${clip.pose}[${index}]: neighboring figures cannot overlap source crops`);
          const bounds = { x: source.x - expanded.x, y: source.y - expanded.y, width: source.width, height: source.height };
          const normalized = { headWidth: headWidth * cellWidth / expanded.width, pivot: [(frameCell.x + pivot[0] * cellWidth - expanded.x) / expanded.width, (frameCell.y + pivot[1] * cellHeight - expanded.y) / expanded.height], ...(floor === undefined ? {} : { floor: (frameCell.y + floor * cellHeight - expanded.y) / expanded.height }) };
          const geometry = buildSpriteFrame(expanded, bounds, normalized, displayHeadSize);
          near(headWidth * cellWidth * geometry.scale, displayHeadSize, `${clip.pose}[${index}]: stable anatomical head scale`);
          near(geometry.pivotX + source.x * geometry.scale, (frameCell.x + pivot[0] * cellWidth) * geometry.scale, `${clip.pose}[${index}]: cross-cell expansion preserves root X`);
          near(geometry.pivotY + source.y * geometry.scale, (frameCell.y + pivot[1] * cellHeight) * geometry.scale, `${clip.pose}[${index}]: cross-cell expansion preserves root Y`);
          checkedFrames++;
        }
        checkedClips++;
      }
    }
  }
  console.log(`Animation geometry passed: tail/hand extension, trimming, resolution, root/floor stability; ${checkedClips} generated clips / ${checkedFrames} frames checked${checkedFrames ? '' : ' (generated manifest not present yet)'}.`);
} finally {
  if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('trash-panda-animation-')) fs.rmSync(temporary, { recursive: true, force: true });
}
