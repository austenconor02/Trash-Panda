import { config } from './config';
let nebula: HTMLCanvasElement | null = null;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
const hash = (x: number, y: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
export function cosmosBlend(altitudeFeet: number) {
  return smooth((altitudeFeet - config.cosmos.startFeet) / (config.cosmos.fullFeet - config.cosmos.startFeet));
}
// Periodic noise makes the cached procedural nebula join seamlessly at every edge.
export function prepareNebula() {
  if (nebula) return nebula;
  const size = config.cosmos.textureSize, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const noise = (x: number, y: number, period: number) => {
    const sx = x / size * period, sy = y / size * period, gx = Math.floor(sx), gy = Math.floor(sy);
    const fx = smooth(sx - gx), fy = smooth(sy - gy);
    const a = hash(gx % period, gy % period), b = hash((gx + 1) % period, gy % period);
    const c = hash(gx % period, (gy + 1) % period), d = hash((gx + 1) % period, (gy + 1) % period);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const broad = noise(x, y, 3), medium = noise(x, y, 7), fine = noise(x, y, 15), dust = noise(x, y, 31);
    const cloud = clamp((broad * 0.5 + medium * 0.3 + fine * 0.14 + dust * 0.06 - 0.28) * 2.9);
    const light = cloud * cloud, violet = clamp((medium - 0.55) * 3);
    const i = (y * size + x) * 4;
    image.data[i] = 18 + light * 125 + violet * 32;
    image.data[i + 1] = 48 + light * 160 - violet * 18;
    image.data[i + 2] = 105 + light * 140;
    image.data[i + 3] = cloud ** 1.25 * 215;
  }
  ctx.putImageData(image, 0, 0); nebula = canvas; return canvas;
}
export function drawCosmos(ctx: CanvasRenderingContext2D, width: number, height: number, worldX: number, worldY: number) {
  const c = config.cosmos, blend = cosmosBlend(worldY * config.feetPerUnit);
  if (blend <= 0) return;
  ctx.save(); ctx.globalAlpha = blend;
  const offsetX = worldX * c.parallax, offsetY = -worldY * c.parallax;
  const tile = prepareNebula();
  if (tile) {
    const x0 = -((offsetX % c.tileSize + c.tileSize) % c.tileSize), y0 = -((offsetY % c.tileSize + c.tileSize) % c.tileSize);
    for (let x = x0; x < width; x += c.tileSize) for (let y = y0; y < height; y += c.tileSize) ctx.drawImage(tile, x, y, c.tileSize, c.tileSize);
  }
  const s = c.starSpacing;
  const minX = Math.floor(offsetX / s) - 1, maxX = Math.ceil((offsetX + width) / s);
  const minY = Math.floor(offsetY / s) - 1, maxY = Math.ceil((offsetY + height) / s);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    const seed = hash(x + 503, y + 127); if (seed < 0.18) continue;
    const px = (x + hash(x + 89, y + 103)) * s - offsetX, py = (y + hash(x + 271, y + 997)) * s - offsetY;
    const bright = hash(x + 601, y - 179), radius = bright > 0.98 ? 2 : 0.45 + bright * 0.75;
    ctx.globalAlpha = blend * (0.25 + bright * 0.7);
    ctx.fillStyle = seed > 0.9 ? '#f5cce8' : seed > 0.65 ? '#c1eaff' : '#fff4df';
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
    if (bright > 0.98) {
      ctx.globalAlpha = blend * 0.12; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = blend * 0.5; ctx.fillRect(px - 4, py - 0.4, 8, 0.8); ctx.fillRect(px - 0.4, py - 4, 0.8, 8);
    }
  }
  ctx.restore();
}
