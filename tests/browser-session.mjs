// Native Chrome DevTools client. Uses an isolated profile; never opens a user's profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function connect() {
  const pages = await (await fetch('http://127.0.0.1:9341/json')).json();
  const page = pages.find(page => page.type === 'page');
  assert.ok(page, 'isolated Chrome page available');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  // Node's native WebSocket alone may not keep a pending CDP call alive.
  const keepAlive = setInterval(() => {}, 1000);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id); if (!call) return;
      pending.delete(message.id); clearTimeout(call.timer);
      message.error ? call.reject(new Error(JSON.stringify(message.error))) : call.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const target = path.resolve('artifacts/playtest', `${name}.png`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(shot.data, 'base64')); return target;
  };
  const key = (key, down, code = key) => send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key, code, windowsVirtualKeyCode: ({ ArrowDown:40, ArrowUp:38, ArrowLeft:37, ArrowRight:39, Escape:27, ' ':32 })[key] ?? key.toUpperCase().charCodeAt(0) });
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button:'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount:1 });
  const close = () => { ws.close(); clearInterval(keepAlive); for (const call of pending.values()) clearTimeout(call.timer); };
  await send('Runtime.enable'); await send('Page.enable');
  return { send, evaluate, screenshot, key, mouse, errors, close };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2]) {
  const c = await connect();
  try { await new (Object.getPrototypeOf(async function(){}).constructor)('c', 'delay', 'fs', await fs.readFile(process.argv[2], 'utf8'))(c, delay, fs); }
  finally { c.close(); }
}
