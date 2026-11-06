import { config } from './config';
import { gravityScaleAtAltitude } from './physics';
import { mission } from './progression';
import type { Planet } from './progression';
import { SatelliteField } from './satellites';
import type { SatelliteContact } from './satellites';
export type Tier = keyof typeof config.platforms;
export interface Platform { id: string; x: number; y: number; width: number; tier: Tier; used: boolean; age: number; vy: number }
export interface MagnetFlight { fromX:number; fromY:number; targetX:number; targetY:number; age:number; duration:number }
export interface Coin { id: string; x: number; y: number; tier: Tier | 'scrap'; scrapValue?: number; magnet?: MagnetFlight }
export interface PickupVisual { coin: Coin; x:number; y:number; age:number }
export interface Rewards { coins: number; coinCents: number; platformCents: number; scrap: number; satellite?: SatelliteContact }
interface Chunk { platforms: Platform[]; coins: Coin[] }
interface Effect { x: number; y: number; text: string; age: number; bounce: boolean }
const emptyRewards = (): Rewards => ({ coins: 0, coinCents: 0, platformCents: 0, scrap: 0 });
export function sampleTier(value: number, weights: Record<Tier, number> = config.generation.tierWeights): Tier {
  const entries = Object.entries(weights) as [Tier, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = value * total;
  for (const [tier, weight] of entries) { remaining -= weight; if (remaining < 0) return tier; }
  return entries[entries.length - 1][0];
}
export class World {
  private chunks = new Map<string, Chunk>();
  private consumed = new Set<string>();
  private captured = new Map<string, Coin>();
  pickups: PickupVisual[] = [];
  effects: Effect[] = [];
  visualTime = 0;
  readonly satellites = new SatelliteField();
  coinValueLevel = 0; platformValueLevel = 0;
  planet: Planet = 'earth';
  private runSeed: number;
  constructor(seed = Math.floor(Math.random() * 4294967296)) { this.runSeed = seed >>> 0; }
  get ceilingY() { return mission(this.planet).targetFeet / config.feetPerUnit; }
  get rewardMultiplier() { return this.planet === 'moon' ? config.lunar.rewardMultiplier : 1; }
  get platforms() { return [...this.chunks.values()].flatMap(chunk => chunk.platforms); }
  get coins() { return [...this.chunks.values()].flatMap(chunk => chunk.coins).concat([...this.captured.values()]); }
  reset(seed = Math.floor(Math.random() * 4294967296)) {
    const next = seed >>> 0;
    this.runSeed = next === this.runSeed ? (next ^ 0x9e3779b9) >>> 0 : next;
    this.chunks.clear(); this.consumed.clear(); this.effects = []; this.visualTime = 0;
    this.captured.clear(); this.pickups = [];
    this.satellites.reset();
  }
  update(x: number, y: number, width: number, height: number, dt: number) {
    this.visualTime += Math.max(0, dt);
    this.satellites.update(dt);
    const g = config.generation;
    const minX = Math.floor((x - width / 2 - g.padding) / g.chunkWidth);
    const maxX = Math.floor((x + width / 2 + g.padding) / g.chunkWidth);
    const minY = Math.max(0, Math.floor((y - height / 2 - g.padding) / g.chunkHeight));
    const maxY = Math.max(0, Math.floor((y + height / 2 + g.padding) / g.chunkHeight));
    for (const [key] of this.chunks) {
      const [cx, cy] = key.split(':').map(Number);
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) this.chunks.delete(key);
    }
    for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) {
      const key = `${cx}:${cy}`;
      if (!this.chunks.has(key)) this.chunks.set(key, this.generate(cx, cy));
    }
    for (const chunk of this.chunks.values()) {
      for (const platform of chunk.platforms) {
        if (!platform.used) continue;
        platform.age += dt;
        if (platform.age > config.platformPhysics.shakeDuration) {
          platform.vy -= config.platformPhysics.fallGravity * gravityScaleAtAltitude(platform.y * config.feetPerUnit, this.planet) * dt; platform.y += platform.vy * dt;
        }
      }
      chunk.platforms = chunk.platforms.filter(p => !p.used || (p.age < 5 && p.y > 0));
    }
    this.effects.forEach(effect => { effect.age += dt; });
    this.effects = this.effects.filter(effect => effect.age < 1);
    this.pickups.forEach(pickup => {
      pickup.age += Math.max(0, dt);
      const follow = 1 - Math.exp(-22 * Math.max(0, dt));
      pickup.x += (x - pickup.x) * follow; pickup.y += (y - pickup.y) * follow;
    });
    this.pickups = this.pickups.filter(pickup => pickup.age < config.magnets.pickupSeconds);
  }
  private generate(cx: number, cy: number): Chunk {
    const g = config.generation;
    let seed = (Math.imul(cx + 231, 73856093) ^ Math.imul(cy + 173, 19349663) ^ this.runSeed ^ (this.planet === 'moon' ? 0x5a71d93 : 0)) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const tier = (): Tier => sampleTier(random());
    const chunk: Chunk = { platforms: [], coins: [] };
    const spacing = Math.min(0.6, cy * g.chunkHeight * config.feetPerUnit / g.spacingGrowthAltitude * 0.12);
    for (let row = 0; row < g.platformRows; row++) {
      const id = `p:${cx}:${cy}:${row}`;
      const skip = random() < spacing;
      let x = cx * g.chunkWidth + g.platformWidth / 2 + 40 + random() * (g.chunkWidth - g.platformWidth - 80);
      let y = (cy + (row + 0.5) / g.platformRows) * g.chunkHeight + (random() - 0.5) * 80;
      let kind = sampleTier(random(), g.platformTierWeights);
      // Generous first target; avoid placing a platform directly above the pouch.
      if (cx === 0 && cy === 0 && row === 0) { x = (random() < 0.5 ? -1 : 1) * (60 + random() * 80); y = 300 + random() * 40; kind = 'silver'; }
      else if (skip || y < 260) continue;
      if (chunk.platforms.some(p => Math.abs(p.y - y) < 160 && Math.abs(p.x - x) < g.platformWidth + 80)) continue;
      // Generate the original layout before removing consumed objects. Their geometry
      // still participates in spacing, so returning to an evicted chunk cannot move
      // the remaining pickups or change which colors/scrap chunks were generated.
      if (y < this.ceilingY) chunk.platforms.push({ id, x, y, width: g.platformWidth, tier: kind, used: false, age: 0, vy: 0 });
    }
    const occupied = chunk.platforms.map(p => ({ x: p.x, y: p.y, radius: p.width / 2 }));
    for (let i = 0; i < g.coinsPerChunk; i++) {
      const kind = tier(), radius = 9;
      let center: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < config.coinScatter.placementAttempts; attempt++) {
        const x = cx * g.chunkWidth + radius + 20 + random() * (g.chunkWidth - 2 * radius - 40);
        const y = cy * g.chunkHeight + radius + 40 + random() * (g.chunkHeight - 2 * radius - 80);
        if (occupied.every(p => Math.hypot(p.x - x, p.y - y) > p.radius + radius + config.coinScatter.spacing)) { center = { x, y }; break; }
      }
      if (!center) continue;
      occupied.push({ ...center, radius });
      const id = `c:${cx}:${cy}:${i}:0`;
      if (center.y < this.ceilingY) chunk.coins.push({ id, ...center, tier: kind });
    }
    for (let i = 0; i < Math.max(g.scrapPerChunk, g.richScrapPerChunk); i++) {
      const id = `s:${cx}:${cy}:${i}`;
      const x = cx * g.chunkWidth + random() * g.chunkWidth, y = (cy + random()) * g.chunkHeight;
      const feet = y * config.feetPerUnit;
      const eligible = feet >= g.scrapAltitude && (i < g.scrapPerChunk || feet >= g.richScrapAltitude);
      if (y < this.ceilingY && eligible) chunk.coins.push({ id, x, y, tier: 'scrap' });
    }
    for (const type of config.scrapChunks) {
      const id = `s${type.value}:${cx}:${cy}`, x = cx * g.chunkWidth + random() * g.chunkWidth, y = (cy + random()) * g.chunkHeight;
      const spawn = random() < type.chance;
      if (spawn && y * config.feetPerUnit >= type.minimumFeet && y < this.ceilingY
        && chunk.coins.every(c => c.tier !== 'scrap' || Math.hypot(c.x - x, c.y - y) > 160)) chunk.coins.push({ id, x, y, tier: 'scrap', scrapValue: type.value });
    }
    chunk.platforms = chunk.platforms.filter(platform => !this.consumed.has(platform.id));
    chunk.coins = chunk.coins.filter(coin => !this.consumed.has(coin.id) && !this.captured.has(coin.id));
    return chunk;
  }
  attract(x: number, y: number, coinLevel: number, scrapLevel: number, dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const chunk of this.chunks.values()) chunk.coins = chunk.coins.filter(coin => {
      const level = coin.tier === 'scrap' ? scrapLevel : coinLevel;
      const radius = level * config.magnets.radiusPerLevel;
      const dx = x - coin.x, dy = y - coin.y, distance = Math.hypot(dx, dy);
      if (distance > config.player.radius + 9 && distance < radius) {
        coin.magnet = { fromX:coin.x, fromY:coin.y, targetX:x, targetY:y, age:0,
          duration:config.magnets.collectionSeconds + Math.max(0, 5 - level) * config.magnets.collectionSecondsPerMissingLevel };
        this.captured.set(coin.id, coin);
        return false;
      }
      return true;
    });
    for (const coin of this.captured.values()) {
      const flight = coin.magnet!;
      flight.age = Math.min(flight.duration, flight.age + dt); flight.targetX = x; flight.targetY = y;
      const p = magnetPosition(coin);
      coin.x = p.x; coin.y = p.y;
    }
  }
  bounce(platform: Platform): Rewards {
    const rewards = emptyRewards();
    if (platform.used || this.consumed.has(platform.id)) return rewards;
    platform.used = true; this.consumed.add(platform.id);
    rewards.platformCents = Math.round(config.platforms[platform.tier].rewardCents * config.rewardValues.multiplierPerLevel ** this.platformValueLevel * this.rewardMultiplier);
    this.effects.push({ x: platform.x, y: platform.y, text: `+$${(rewards.platformCents / 100).toFixed(2)}`, age: 0, bounce: true });
    return rewards;
  }
  collect(x0: number, y0: number, x1: number, y1: number): Rewards {
    const rewards = emptyRewards();
    const dx = x1 - x0, dy = y1 - y0, length = dx * dx + dy * dy;
    const keep = (coin: Coin) => {
      if (coin.magnet && coin.magnet.age < coin.magnet.duration) return true;
      const t = length ? Math.max(0, Math.min(1, ((coin.x - x0) * dx + (coin.y - y0) * dy) / length)) : 0;
      if (Math.hypot(coin.x - x0 - dx * t, coin.y - y0 - dy * t) >= config.player.radius + 9) return true;
      if (!this.consumed.has(coin.id)) {
        this.consumed.add(coin.id);
        if (coin.tier === 'scrap') rewards.scrap += coin.scrapValue ?? 1;
        const coinCents = coin.tier === 'scrap' ? 0 : Math.round(config.coins[coin.tier].valueCents * config.rewardValues.multiplierPerLevel ** this.coinValueLevel * this.rewardMultiplier);
        if (coin.tier !== 'scrap') { rewards.coins++; rewards.coinCents += coinCents; }
        this.effects.push({ x: coin.x, y: coin.y, text: coin.tier === 'scrap' ? `+${coin.scrapValue ?? 1} scrap` : `+$${(coinCents / 100).toFixed(2)}`, age: 0, bounce: false });
        this.pickups.push({ coin: { ...coin, magnet:undefined }, x:coin.x, y:coin.y, age:0 });
      }
      return false;
    };
    for (const chunk of this.chunks.values()) chunk.coins = chunk.coins.filter(keep);
    for (const [id, coin] of this.captured) if (!keep(coin)) this.captured.delete(id);
    return rewards;
  }
}

/** A visible, gently curving flight into the moving character instead of a teleport. */
export function magnetPosition(coin: Coin, behind = 0) {
  const flight = coin.magnet!;
  const t = Math.max(0, Math.min(1, flight.age / flight.duration - behind));
  const ease = t * t * (3 - 2 * t);
  const dx = flight.targetX - flight.fromX, dy = flight.targetY - flight.fromY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.sin(t * Math.PI) * Math.min(32, distance * .16);
  return { x:flight.fromX + dx * ease - dy / distance * bend, y:flight.fromY + dy * ease + dx / distance * bend };
}
