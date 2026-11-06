import { config } from './config';
import type { Coin, Platform } from './world';
import { itemArt } from './item-art';

function phase(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  // Mix neighboring IDs so nearby objects do not all animate in lockstep.
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

/** A small visual bob; the platform's collision surface stays at its world position. */
export function platformHover(platform: Platform, time: number) {
  const settling = platform.used ? Math.max(0, 1 - platform.age / config.platformPhysics.shakeDuration) : 1;
  return Math.sin(time * Math.PI * 2 / config.worldVisuals.hoverPeriod + phase(platform.id))
    * config.worldVisuals.hoverAmplitude * settling;
}

export function coinSpinWidth(id: string, time: number) {
  return Math.max(config.worldVisuals.coinMinimumWidth,
    Math.abs(Math.cos(time * Math.PI * 2 / config.worldVisuals.coinSpinPeriod + phase(id))));
}

/** Stable variation gives each piece its own bounded orbit without moving its pickup anchor. */
export function scrapOrbitPose(coin: Coin, time: number) {
  const seed=phase(coin.id), clock=Number.isFinite(time)?Math.max(0,time):0;
  const magnet=coin.magnet;
  const floating=magnet?Math.max(0,1-magnet.age/Math.max(.001,magnet.duration*.42)):1;
  return {
    x:floating?Math.sin(clock*(.58+seed*.035)+seed)*(3+seed*.36)*floating:0,
    y:floating?Math.cos(clock*(.4+seed*.023)+seed*.73)*(1.2+seed*.23)*floating:0,
    rotation:seed+clock*(.1+seed*.018)*(seed>Math.PI?-1:1)+Math.sin(clock*.43+seed)*.18,
    variant:seed>Math.PI?'scrapAlt' as const:'scrap' as const,
  };
}

export function drawHoverPlatform(ctx: CanvasRenderingContext2D, platform: Platform, x: number, y: number, time: number) {
  const offsetY = platformHover(platform, time);
  const shake = platform.used && platform.age < config.platformPhysics.shakeDuration ? Math.sin(platform.age * 120) * 4 : 0;
  x += shake; y += offsetY;
  const color = config.platforms[platform.tier].color;
  ctx.fillStyle = '#263441'; ctx.fillRect(x - platform.width / 2, y + 2, platform.width, 8);
  ctx.fillStyle = color; ctx.fillRect(x - platform.width / 2, y, platform.width, 6);
  ctx.fillStyle = '#ffffff66'; ctx.fillRect(x - platform.width / 2 + 2, y, platform.width - 4, 2);
  for (const offset of [-platform.width / 3, platform.width / 3]) {
    const nozzleX = x + offset;
    ctx.fillStyle = '#303b47'; ctx.fillRect(nozzleX - 7, y + 8, 14, 7);
    ctx.fillStyle = '#172330'; ctx.fillRect(nozzleX - 5, y + 14, 10, 4);
    if (platform.used) continue;
    const pulse = 0.85 + 0.15 * Math.sin(time * 19 + phase(platform.id) + offset);
    const length = config.worldVisuals.thrusterLength * pulse;
    const top = y + 17;
    const plume = ctx.createLinearGradient(0, top, 0, top + length);
    plume.addColorStop(0, '#e8ffffee'); plume.addColorStop(0.25, '#64eaffb0');
    plume.addColorStop(0.65, '#38baff55'); plume.addColorStop(1, '#309dff00');
    ctx.fillStyle = plume;
    ctx.beginPath(); ctx.moveTo(nozzleX - 4, top);
    ctx.quadraticCurveTo(nozzleX - 7, top + length * 0.45, nozzleX, top + length);
    ctx.quadraticCurveTo(nozzleX + 7, top + length * 0.45, nozzleX + 4, top);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d5ffff'; ctx.fillRect(nozzleX - 3, top - 1, 6, 2);
  }
}

export function drawSpinningCoin(ctx: CanvasRenderingContext2D, coin: Coin, x: number, y: number, time: number, freeFloat = true) {
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#263447';
  if (coin.tier === 'scrap') {
    const pose=scrapOrbitPose(coin,time), size=coin.scrapValue===5?32:coin.scrapValue===2?26:21;
    const px=x+(freeFloat?pose.x:0), py=y+(freeFloat?pose.y:0);
    if (itemArt.draw(ctx,pose.variant,px-size/2,py-size/2,size,size,pose.rotation)) return;
    // A small rusty metal offcut remains readable while the original image loads.
    ctx.save();ctx.translate(px,py);ctx.rotate(pose.rotation);ctx.scale(size/21,size/21);
    ctx.fillStyle='#9a7956';ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(-3,-8);ctx.lineTo(8,-6);
    ctx.lineTo(6,1);ctx.lineTo(9,5);ctx.lineTo(-5,7);ctx.lineTo(-8,2);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#567f83';ctx.fillRect(-5,-3,9,6);ctx.fillStyle='#e4be76';ctx.beginPath();ctx.arc(-2,-1,1.7,0,Math.PI*2);ctx.fill();ctx.restore();
    return;
  }
  const radiusX = 8 * coinSpinWidth(coin.id, time);
  // The darker edge keeps edge-on coins visible and gives the disc thickness.
  ctx.fillStyle = '#34404d'; ctx.beginPath();
  ctx.ellipse(x + 1.5, y, radiusX, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = config.coins[coin.tier].color; ctx.beginPath();
  ctx.ellipse(x, y, radiusX, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (radiusX > 3) {
    ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 0.8; ctx.beginPath();
    ctx.ellipse(x, y, radiusX * 0.65, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff99'; ctx.beginPath();
    ctx.ellipse(x - radiusX * 0.25, y - 2.5, radiusX * 0.15, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  }
}
