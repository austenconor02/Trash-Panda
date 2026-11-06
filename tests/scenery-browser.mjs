// Visual rendering smoke check using installed Chrome and its native DevTools protocol.
// Run while Vite is serving: node tests/scenery-browser.mjs http://127.0.0.1:5174
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:5174';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-scenery-chrome-'));
const output = path.resolve('artifacts/scenery');
await fs.mkdir(output, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9337', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let ws;
try {
  let pages;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { pages = (await (await fetch('http://127.0.0.1:9337/json')).json()).filter(page => page.type === 'page'); if (pages.length) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(pages?.length, 'Chrome debugging started');
  ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.id) { const call = pending.get(result.id); pending.delete(result.id); result.error ? call.reject(result.error) : call.resolve(result.result); }
    if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails);
    if (result.method === 'Log.entryAdded' && result.params.entry.level === 'error' && !result.params.entry.url?.endsWith('/favicon.ico')) errors.push(result.params.entry);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate('Boolean(document.querySelector("#game") && document.querySelector("#accessible-controls")?.children.length)')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('Browser page:', await evaluate('location.href'));
  const imageInfo = await evaluate(`(async () => {
    const response = await fetch('/assets/junkyard-parallax-atlas.png');
    console.log('Atlas response', response.status, response.headers.get('content-type'));
    const image = new Image(); image.src = '/assets/junkyard-parallax-atlas.png'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const { config } = await import('/src/config.ts');
    const rows = config.groundScene.atlasRows;
    const alphas = Array.from({length: 4}, (_, row) => ctx.getImageData(0, rows[row], image.width, rows[row+1]-rows[row]).data);
    return { width: image.width, height: image.height, rows: alphas.map(data => {
      let empty = 0, solid = 0; for (let i=3;i<data.length;i+=4) { if (data[i]===0) empty++; if(data[i]>=230)solid++; }
      return { empty, solid };
    }) };
  })()`);
  assert.ok(imageInfo.rows.every(row => row.empty > 100 && row.solid > 100), 'each atlas layer contains artwork and real transparency: ' + JSON.stringify(imageInfo));
  await evaluate(`document.querySelector('#pilot-name').value = 'Scenery preview'; [...document.querySelectorAll('#accessible-controls button')].find(button => button.textContent === 'NEW GAME').click()`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const gameScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'game-aiming.png'), Buffer.from(gameScreenshot.data, 'base64'));
  const aim = await evaluate(`(async () => { const {config} = await import('/src/config.ts'); return {x:720, y:900*config.camera.groundScreenRatio-config.launcher.restHeight*config.camera.zoom}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: aim.x, y: aim.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: aim.x - 80, y: aim.y + 80, button: 'left', buttons: 1 });
  assert.equal(await evaluate('document.querySelector("#game").hasPointerCapture(1)'), true, 'zoomed raccoon can be grabbed with the mouse');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: aim.x - 80, y: aim.y + 80, button: 'left', clickCount: 1 });
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(await evaluate('document.querySelector("#game").style.cursor'), 'default', 'mouse release launches the raccoon');
  const flightScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'game-flight.png'), Buffer.from(flightScreenshot.data, 'base64'));
  await evaluate(`(async () => {
    const { drawHoverPlatform, drawSpinningCoin } = await import('/src/world-visuals.ts');
    const canvas = document.createElement('canvas'); canvas.id = 'visuals-preview';
    canvas.width = 1440; canvas.height = 900;
    canvas.style = 'position:fixed;inset:0;z-index:1000;width:100vw;height:100vh';
    document.body.append(canvas);
    window.paintWorldVisuals = time => {
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1d344c'; ctx.fillRect(0,0,1440,900);
      ctx.fillStyle = '#fff'; ctx.font = '24px monospace'; ctx.fillText('HOVER / ACTIVE THRUSTERS', 70, 80);
      ctx.fillText('USED / THRUSTERS OFF', 70, 390); ctx.fillText('COIN ROTATION / SCRAP', 70, 650);
      ctx.save(); ctx.scale(2, 2);
      ['silver','gold','red','purple'].forEach((tier, i) => {
        const platform = Object.freeze({id:'preview-platform-'+i,tier,x:0,y:0,width:150,used:false,age:0});
        drawHoverPlatform(ctx, platform, 115+i*160, 100, time);
        drawHoverPlatform(ctx, {...platform,used:true,age:1}, 115+i*160, 230, time);
        for(let j=0;j<4;j++) drawSpinningCoin(ctx, Object.freeze({id:'preview-coin-'+i+'-'+j,tier,x:0,y:0}), 60+i*160+j*30, 370, time);
      });
      drawSpinningCoin(ctx,{id:'scrap-preview',tier:'scrap',scrapValue:5,x:0,y:0},660,415,time);
      ctx.restore(); return canvas.toDataURL();
    };
  })()`);
  const firstVisualFrame = await evaluate('paintWorldVisuals(0)');
  for (const [name,time] of [['visuals-a',0],['visuals-b',0.35],['visuals-c',0.7]]) {
    await evaluate(`paintWorldVisuals(${time})`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  assert.notEqual(await evaluate('paintWorldVisuals(0.35)'),firstVisualFrame,'hover and coin rotation visibly animate');
  assert.equal(await evaluate('paintWorldVisuals(0)'),firstVisualFrame,'fixed simulation time renders the same animation frame');
  await evaluate('document.querySelector("#visuals-preview").remove()');
  const satelliteAsset = await evaluate(`(async () => {
    // Stop the ordinary preview loop; drive a fresh game deterministically here.
    window.requestAnimationFrame = () => 0;
    await new Promise(resolve => setTimeout(resolve,50));
    const { Game } = await import('/src/game.ts'); const { config } = await import('/src/config.ts');
    const game = window.satelliteGame = new Game(); game.ui.slot = 2; game.dispatch('new');
    if(game.state==='menu')game.dispatch('overwrite');
    game.data.levels.suit = 5; game.input.clear();
    await new Promise((resolve,reject) => { let attempts=0;const check=()=>{
      if(game.renderer.satelliteSprite.image)resolve();
      else if(++attempts>100)reject(new Error('satellite sprite failed to load'));else setTimeout(check,50);
    };check();});
    window.prepareOrbit = (lane,offset=250) => {
      const orbit=config.satellites.orbits[lane],y=orbit.feet/config.feetPerUnit;
      game.setPaused(false);game.state='flying';game.failed=false;game.world.reset();game.score.reset();
      game.player.reset(y+100);game.player.x=orbit.phase+offset;game.equipment.health=100;game.equipment.oxygen=1000;
      game.camera.x=game.player.x;game.camera.y=y+110;game.lastTime=0;game.accumulator=0;
      game.world.update(game.player.x,game.player.y,1440/config.camera.zoom,900/config.camera.zoom,0);
      game.frame(0);
    };
    const sprite=game.renderer.satelliteSprite;
    const canvas=document.createElement('canvas');canvas.width=sprite.image.naturalWidth;canvas.height=sprite.image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(sprite.image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let empty=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]===0)empty++;
    return {crop:sprite.crop,empty};
  })()`);
  assert.ok(satelliteAsset.empty > 1000 && satelliteAsset.crop.width > 100, 'satellite sprite loads with actual transparency and readable artwork');
  for (const [lane, feet] of [[0,55000],[1,65000],[2,70000]]) {
    await evaluate(`prepareOrbit(${lane})`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'satellite-' + feet + '.png'), Buffer.from(shot.data,'base64'));
  }
  await evaluate('prepareOrbit(1,-900)');
  const warningShot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(path.join(output,'satellite-warning.png'),Buffer.from(warningShot.data,'base64'));
  const impact = await evaluate(`(() => {
    prepareOrbit(0,0);const game=window.satelliteGame;
    game.player.y=55000/5;game.player.vx=4000;game.player.vy=2000;
    game.step(0);game.frame(0);
    const result={health:game.equipment.health,vx:game.player.vx,vy:game.player.vy,flash:game.world.satellites.impactFlash};
    game.setPaused(true);const time=game.world.satellites.time;game.step(2);
    result.pauseFrozen=game.world.satellites.time===time;game.setPaused(false);game.frame(0);return result;
  })()`);
  assert.equal(impact.health,75); assert.equal(impact.vx,1000);assert.equal(impact.vy,-500);
  assert.ok(impact.flash>0 && impact.pauseFrozen,'impact feedback and orbital pause work in the real game');
  const impactShot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(path.join(output,'satellite-impact.png'),Buffer.from(impactShot.data,'base64'));
  await evaluate(`(async () => {
    const { GroundScene } = await import('/src/ground-scene.ts');
    const { Camera } = await import('/src/camera.ts');
    const { drawAtmosphere } = await import('/src/atmosphere.ts');
    window.scenery = new GroundScene(); window.sceneryCamera = new Camera();
    const canvas = document.createElement('canvas'); canvas.id = 'scenery-preview';
    canvas.style = 'position:fixed;inset:0;z-index:1000;width:100vw;height:100vh';
    document.body.append(canvas);
    window.paintScenery = (x, altitude = 0, w = 1440, h = 900) => {
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); const camera = window.sceneryCamera;
      ctx.scale(camera.zoom, camera.zoom); w /= camera.zoom; h /= camera.zoom;
      camera.x = x; camera.y = h * .25 + altitude;
      drawAtmosphere(ctx, w, h, camera.y, x);
      const ground = camera.toScreen(0, 0, w, h).y;
      ctx.fillStyle='#39291e'; ctx.fillRect(0, ground, w, h);
      window.scenery.draw(ctx, camera, w, h);
      // A character-sized marker checks that foreground does not cover the play plane.
      ctx.fillStyle='#ffffff'; ctx.fillRect(w/2-8, ground-64, 16, 64);
      window.scenery.drawForeground(ctx, camera, w, h);
    };
    await new Promise((resolve,reject) => { let attempts=0; const check=()=>{
      if(window.scenery.layers.length===4 && window.scenery.props.length===4) resolve();
      else if(++attempts>100) reject(new Error('scenery assets did not load')); else setTimeout(check,50);
    }; check(); });
  })()`);
  for (const [name, x, altitude] of [['launch',0,0], ['right',2400,0], ['left',-2400,0], ['seam',4500.5,0], ['distant',10000000.25,0], ['altitude',2400,1000]]) {
    await evaluate(`paintScenery(${x},${altitude})`);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('paintScenery(-2400,0,390,844)');
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  await evaluate('document.querySelector("#scenery-preview").remove()');
  assert.deepEqual(errors, [], 'no Chrome runtime or loading errors');
  console.log(JSON.stringify({ imageInfo, screenshots: output, browserErrors: errors.length }, null, 2));
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  ws?.close(); chrome.kill();
  // Chrome may still be releasing the isolated profile on Windows; never remove other profiles.
  await new Promise(resolve => setTimeout(resolve, 500));
  if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('panda-scenery-chrome-')) {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {});
  }
}
