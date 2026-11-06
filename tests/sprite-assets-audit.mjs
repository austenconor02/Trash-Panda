// Read-only audit of the actual v2 PlayerSprite loader in the isolated browser.
// Does not navigate, resize, touch storage, or mutate the running game's sprite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { connect } from './browser-session.mjs';

const previousReport = await fs.readFile('artifacts/playtest/sprite-assets-audit.json', 'utf8').catch(() => null);
const client = await connect();
try {
  const report = await client.evaluate(`(async () => {
    const snapshot = () => JSON.stringify({
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      storage: Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
      game: typeof game === 'undefined' ? null : {
        state: game.state, paused: game.paused, player: [game.player.x,game.player.y,game.player.vx,game.player.vy],
        duration: game.score.duration, wallet: game.data.moneyCents, scrap: game.data.scrap, flights: game.data.flights,
      },
    });
    const before = snapshot();
    const [{ PlayerSprite }, { config }, { animationClips }, { playerAtlases }] = await Promise.all([
      import('/src/player-sprite.ts?runtime_asset_audit=' + Date.now()), import('/src/config.ts'),
      import('/src/player-animation.ts'), import('/src/player-animation-assets.ts'),
    ]);
    const current = new PlayerSprite();
    let timer;
    // Finish before the DevTools client's 15-second deadline with a useful error.
    try { await Promise.race([current.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('v2 sprite assets did not become ready within 10 seconds')), 10000); })]); }
    finally { clearTimeout(timer); }
    const definitions = new Map(playerAtlases.flatMap(atlas => atlas.clips.map(clip => [clip.pose, { atlas, clip }])));
    const pixelsByImage = new Map(), frames = [];
    const near = (a,b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) < 1e-7;
    for (const [pose, runtimeFrames] of current.frames) {
      const definition = definitions.get(pose);
      if (!definition) throw new Error('Unexpected runtime pose: ' + pose);
      const { atlas, clip } = definition;
      for (let index = 0; index < runtimeFrames.length; index++) {
        const frame = runtimeFrames[index], image = frame.image;
        if (!pixelsByImage.has(image)) {
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image,0,0);
          pixelsByImage.set(image, ctx.getImageData(0,0,canvas.width,canvas.height).data);
        }
        const column = index % atlas.columns, row = clip.row + Math.floor(index / atlas.columns);
        const x = Math.floor(column * image.naturalWidth / atlas.columns), y = Math.floor(row * image.naturalHeight / atlas.rows);
        const cellWidth = Math.floor((column+1)*image.naturalWidth/atlas.columns)-x;
        const cellHeight = Math.floor((row+1)*image.naturalHeight/atlas.rows)-y;
        const headWidth = typeof clip.headWidth === 'number' ? clip.headWidth : clip.headWidth[index];
        const pivot = typeof clip.pivot[0] === 'number' ? clip.pivot : clip.pivot[index];
        const floor = typeof clip.floor === 'number' || clip.floor === undefined ? clip.floor : clip.floor[index];
        const contained = [frame.x,frame.y,frame.width,frame.height].every(Number.isInteger) && frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0 && frame.x+frame.width <= image.naturalWidth && frame.y+frame.height <= image.naturalHeight;
        let opaquePixels = 0, transparentPixels = 0;
        if (contained) {
          const pixels = pixelsByImage.get(image);
          for (let py=frame.y;py<frame.y+frame.height;py++) for(let px=frame.x;px<frame.x+frame.width;px++) {
            const alpha = pixels[(py*image.naturalWidth+px)*4+3];
            if (alpha>=128) opaquePixels++; if(alpha<8) transparentPixels++;
          }
        }
        const expectedScale = config.playerVisuals.headSize/(headWidth*cellWidth);
        const expectedPivotX = (x+pivot[0]*cellWidth-frame.x)*expectedScale;
        const expectedPivotY = (y+pivot[1]*cellHeight-frame.y)*expectedScale;
        const expectedFloorY = floor === undefined ? undefined : (y+floor*cellHeight-frame.y)*expectedScale;
        frames.push({
          pose,index,asset:new URL(image.src).pathname,crop:[frame.x,frame.y,frame.width,frame.height],
          imageSize:[image.naturalWidth,image.naturalHeight],sourceRow:row,sourceColumn:column,
          scale:frame.scale,drawSize:[frame.width*frame.scale,frame.height*frame.scale],
          renderedHeadWidth:headWidth*cellWidth*frame.scale,pivot:[frame.pivotX,frame.pivotY],floorY:frame.floorY ?? null,
          contained,opaquePixels,transparentPixels,
          scaleMatchesAnatomy:near(frame.scale,expectedScale),
          headMatchesConfig:near(headWidth*cellWidth*frame.scale,config.playerVisuals.headSize),
          pivotMatchesAuthored:near(frame.pivotX,expectedPivotX)&&near(frame.pivotY,expectedPivotY),
          floorMatchesAuthored:expectedFloorY === undefined ? frame.floorY === undefined : near(frame.floorY,expectedFloorY),
          mirrorMatchesAuthored:!!frame.mirror===!!clip.mirror,
        });
      }
    }
    return {
      description:'Actual v2 PlayerSprite.ready loader, source-image alpha, anatomical scale, pivots, floors and wrapped atlas indexing. Existing game, storage and viewport unchanged.',
      poseCount:current.frames.size,frameCount:frames.length,atlasCount:playerAtlases.length,headSize:config.playerVisuals.headSize,
      expectedFrames:Object.fromEntries(Object.entries(animationClips).map(([pose,clip])=>[pose,clip.frames])),
      actualFrames:Object.fromEntries([...current.frames].map(([pose,frames])=>[pose,frames.length])),
      loadErrors:current.loadErrors,unchanged:snapshot()===before,frames,
    };
  })()`);
  assert.equal(report.poseCount, 22); assert.equal(report.frameCount, 180); assert.equal(report.headSize, 32);
  assert.deepEqual(report.actualFrames, report.expectedFrames, 'runtime frame counts match the animation clips');
  assert.deepEqual(report.loadErrors, [], 'all v2 atlas assets load');
  assert.equal(report.unchanged, true, 'audit leaves game, localStorage and viewport unchanged');
  for (const frame of report.frames) {
    assert.ok(frame.contained, `${frame.pose}[${frame.index}] crop stays inside its source image`);
    assert.ok(frame.opaquePixels > 25 && frame.transparentPixels > 0, `${frame.pose}[${frame.index}] contains real artwork and transparency`);
    for (const check of ['scaleMatchesAnatomy','headMatchesConfig','pivotMatchesAuthored','floorMatchesAuthored','mirrorMatchesAuthored']) assert.equal(frame[check], true, `${frame.pose}[${frame.index}] ${check}`);
  }
  assert.deepEqual(client.errors, [], 'no browser exceptions during the read-only audit');
  await fs.mkdir('artifacts/animation-pass', { recursive: true });
  const output = 'artifacts/animation-pass/runtime-assets-audit.json';
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  if (previousReport !== null) assert.equal(await fs.readFile('artifacts/playtest/sprite-assets-audit.json', 'utf8'), previousReport, 'legacy before-audit evidence is preserved');
  console.log(JSON.stringify({ poses: report.poseCount, frames: report.frameCount, atlases: report.atlasCount, headSize: report.headSize, unchanged: report.unchanged, browserErrors: client.errors.length, report: output }));
} finally { client.close(); }
