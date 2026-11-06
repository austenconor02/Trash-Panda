import { config } from './config';
import type { Player } from './player';

export interface Satellite { id: string; x: number; y: number; speed: number; feet: number }
export interface SatelliteContact extends Satellite { time:number; landing:boolean }
export interface SatelliteWreck extends Satellite { age:number; vy:number }

/** Continuous horizontal orbits in world space; no camera-relative spawning or wrapping. */
export class SatelliteField {
  time = 0;
  private previousTime = 0;
  private cooldown = 0;
  impactFlash = 0;
  readonly wreckage: SatelliteWreck[] = [];
  private broken = new Set<string>();

  reset() { this.time = this.previousTime = this.cooldown = this.impactFlash = 0; this.broken.clear(); this.wreckage.length = 0; }
  update(dt: number) {
    this.previousTime = this.time;
    this.time += Math.max(0, dt);
    this.cooldown = Math.max(0, this.cooldown - Math.max(0, dt));
    this.impactFlash = Math.max(0, this.impactFlash - Math.max(0, dt));
    const step = Math.max(0, dt), gravity = config.satellites.wreckGravity;
    for (const wreck of this.wreckage) {
      wreck.age += step; wreck.x += wreck.speed * step;
      wreck.y += wreck.vy * step - gravity * step * step / 2; wreck.vy -= gravity * step;
    }
    for (let i = this.wreckage.length - 1; i >= 0; i--) if (this.wreckage[i].age >= config.satellites.wreckSeconds) this.wreckage.splice(i, 1);
  }

  visible(left: number, right: number, bottom: number, top: number): Satellite[] {
    const result: Satellite[] = [];
    for (const [lane, orbit] of config.satellites.orbits.entries()) {
      const scatter = config.satellites.altitudeScatterFeet;
      if ((orbit.feet + scatter) / config.feetPerUnit < bottom || (orbit.feet - scatter) / config.feetPerUnit > top) continue;
      const origin = orbit.phase + orbit.speed * this.time;
      const first = Math.ceil((left - origin) / orbit.spacing);
      const last = Math.floor((right - origin) / orbit.spacing);
      for (let index = first; index <= last; index++) {
        const id = `satellite:${lane}:${index}`;
        if (this.broken.has(id)) continue;
        // Stable per-satellite heights survive camera movement and run resets.
        const feet = orbit.feet + Math.sin(index * (127.1 + lane * 31.7)) * scatter;
        const y = feet / config.feetPerUnit;
        if (y < bottom || y > top) continue;
        result.push({ id, x: origin + index * orbit.spacing, y, speed: orbit.speed, feet });
      }
    }
    return result;
  }

  /** Sweep relative player/satellite motion so fast horizontal flight cannot tunnel through. */
  contact(player: Player, previousX: number, previousY: number, canLand = true): SatelliteContact | null {
    if (this.cooldown > 0 || player.arrived) return null;
    const s = config.satellites;
    const halfWidth = s.hitWidth / 2 + config.player.radius;
    const halfHeight = s.hitHeight / 2 + config.player.radius;
    const step = this.time - this.previousTime;
    const maxTravel = Math.max(...s.orbits.map(orbit => Math.abs(orbit.speed))) * step;
    const candidates = this.visible(Math.min(previousX, player.x) - halfWidth - maxTravel,
      Math.max(previousX, player.x) + halfWidth + maxTravel,
      Math.min(previousY, player.y) - halfHeight, Math.max(previousY, player.y) + halfHeight);
    let hit: SatelliteContact | null = null;
    for (const satellite of candidates) {
      const startX = previousX - (satellite.x - satellite.speed * step);
      const startY = previousY - satellite.y;
      const dx = player.x - satellite.x - startX;
      const dy = player.y - satellite.y - startY;
      let enter = 0, exit = 1;
      for (const [start, delta, extent] of [[startX, dx, halfWidth], [startY, dy, halfHeight]]) {
        if (delta === 0) { if (Math.abs(start) > extent) { enter = 2; break; } }
        else {
          const a = (-extent - start) / delta, b = (extent - start) / delta;
          enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
      }
      if (enter <= exit && (!hit || enter < hit.time)) {
        // Only entry through the top face is a landing; descending side hits still hurt.
        const landing = canLand && dy < 0 && startY >= halfHeight
          && Math.abs(startY + dy * enter - halfHeight) < 1e-6;
        hit = { ...satellite, time:enter, landing };
      }
    }
    return hit;
  }

  resolve(player: Player, previousX: number, previousY: number, hit: SatelliteContact) {
    const s = config.satellites, halfHeight = s.hitHeight / 2 + config.player.radius;
    // Resolve at the first crossed face so fast flight cannot tunnel through.
    player.x = previousX + (player.x - previousX) * hit.time;
    if (hit.landing) {
      player.landOnSatellite(hit.y + s.hitHeight / 2);
      this.broken.add(hit.id);
      this.wreckage.push({ ...hit, x:hit.x - hit.speed * (this.time - this.previousTime) * (1 - hit.time), age:0, vy:-45 });
    } else {
      player.y = hit.y - halfHeight - 1;
      player.satelliteImpact();
      this.impactFlash = s.flashSeconds;
    }
    this.cooldown = s.hitCooldown;
    return hit;
  }

  /** Direct collision entry point used by diagnostics and isolated physics checks. */
  collide(player: Player, previousX: number, previousY: number, canLand = true): SatelliteContact | null {
    const hit = this.contact(player, previousX, previousY, canLand);
    return hit ? this.resolve(player, previousX, previousY, hit) : null;
  }
}
