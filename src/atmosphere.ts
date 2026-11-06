import { config } from './config';
import { drawCosmos } from './cosmos';
const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
const markers = config.atmosphere.map(zone => ({ ...zone, rgb: rgb(zone.color) }));
export function skyColor(altitude: number) {
  const upper = markers.findIndex(zone => zone.altitude > altitude);
  if (upper === 0) return markers[0].color;
  if (upper === -1) return markers[markers.length - 1].color;
  const a = markers[upper - 1], b = markers[upper];
  const t = (altitude - a.altitude) / (b.altitude - a.altitude);
  const blend = t * t * (3 - 2 * t);
  return `rgb(${a.rgb.map((channel, i) => Math.round(channel + (b.rgb[i] - channel) * blend)).join(',')})`;
}
export function zoneName(altitude: number) { return [...markers].reverse().find(zone => altitude >= zone.altitude)?.name ?? markers[0].name; }
export function drawAtmosphere(ctx: CanvasRenderingContext2D, width: number, height: number, worldCenterY: number, worldCenterX: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  // Each sample derives from the world altitude of that row, independent of zone/camera state.
  for (let i = 0; i <= 16; i++) gradient.addColorStop(i / 16, skyColor((worldCenterY + height / 2 - height * i / 16) * config.feetPerUnit));
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  const spacing = 150;
  const minX = Math.floor((worldCenterX - width / 2) / spacing);
  const maxX = Math.ceil((worldCenterX + width / 2) / spacing);
  const minY = Math.floor((worldCenterY - height / 2) / spacing);
  const maxY = Math.ceil((worldCenterY + height / 2) / spacing);
  for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
    const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
    const seed = hash - Math.floor(hash);
    const y = (gy + seed) * spacing;
    const opacity = Math.max(0, Math.min(0.75, (y * config.feetPerUnit - 25000) / 60000));
    if (seed < 0.45 || !opacity) continue;
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.beginPath(); ctx.arc(width / 2 + (gx + seed) * spacing - worldCenterX, height / 2 - y + worldCenterY, 1 + seed, 0, Math.PI * 2); ctx.fill();
  }
  drawCosmos(ctx, width, height, worldCenterX, worldCenterY);
}
