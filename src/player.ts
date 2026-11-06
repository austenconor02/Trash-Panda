import { config } from './config';
import type { Vector } from './slingshot';
import type { World } from './world';
import { gravityAtAltitude } from './physics';
import type { Planet } from './progression';
export class Player {
  x = 0; y = 0; vx = 0; vy = 0;
  grounded = false;
  rotation = 0;
  dragFactor = 1;
  fallSpeedLimit: number = config.physics.terminalSpeed;
  thrustingUp = false;
  planet: Planet = 'earth';
  arrived = false;
  private reboundAge = 0;
  private reboundVelocity = 0;
  reset(height: number) { this.x = 0; this.y = height; this.vx = this.vy = this.rotation = 0; this.thrustingUp = false; this.grounded = false; this.arrived = false; this.reboundAge = this.reboundVelocity = 0; this.fallSpeedLimit = config.physics.terminalSpeed; }
  launch(velocity: Vector) { this.vx = velocity.x; this.vy = velocity.y; this.grounded = false; }
  teleport(x: number, y: number, velocity: Vector) { this.reset(y); this.x = x; this.launch(velocity); }
  satelliteImpact() {
    const s = config.satellites;
    this.vx *= s.velocityRetention;
    this.vy = -Math.max(s.minimumDownSpeed, Math.abs(this.vy) * s.velocityRetention);
    this.reboundAge = this.reboundVelocity = 0;
    this.grounded = this.thrustingUp = false;
  }
  landOnSatellite(top: number) {
    this.y = top + config.player.radius;
    this.reboundVelocity = Math.min(config.platforms.silver.minimumBounce * config.platformPhysics.maxBounceRatio,
      Math.max(config.platforms.silver.minimumBounce, Math.abs(this.vy) * config.platformPhysics.reboundRetention));
    this.reboundAge = 0; this.vy = 0;
    this.vx *= config.platformPhysics.horizontalRetention;
    this.grounded = this.thrustingUp = false;
  }
  step(dt: number, world: World, canBounce = true) {
    const previousY = this.y;
    const previousX = this.x;
    const p = config.physics;
    if (!canBounce) this.reboundVelocity = 0;
    this.applyRebound(dt);
    const gravity = gravityAtAltitude(this.y * config.feetPerUnit, this.planet);
    const apexWeight = Math.max(0, 1 - Math.abs(this.vy) / config.turnaround.speedRange);
    const apexSmooth = apexWeight * apexWeight * (3 - 2 * apexWeight);
    const turnaround = !this.thrustingUp && gravity > 0 ? 1 + (config.turnaround.gravityMultiplier - 1) * apexSmooth : 1;
    this.vy -= gravity * turnaround * dt;
    const damping = Math.exp(-p.drag * this.dragFactor * dt);
    // Air drag slows existing momentum, independently of fuel and propulsion.
    this.vx *= Math.exp(-p.horizontalDrag * this.dragFactor * dt); this.vy *= damping;
    // Return smoothly from a deployed-boot fall instead of snapping to the normal terminal limit.
    if (this.vy < -this.fallSpeedLimit) this.vy += (-this.fallSpeedLimit - this.vy) * (1 - Math.exp(-6 * dt));
    this.x += this.vx * dt; this.y += this.vy * dt;
    const radius = config.player.radius;
    if (this.vy > 0 && this.y + radius >= world.ceilingY && previousY + radius < world.ceilingY) {
      const t = (world.ceilingY - radius - previousY) / (this.y - previousY);
      this.x = previousX + (this.x - previousX) * t; this.y = world.ceilingY - radius;
      this.vx = this.vy = 0; this.arrived = true; this.reboundVelocity = 0;
    }
    let platformCents = 0;
    const satellite = world.planet === 'earth' ? world.satellites?.contact(this, previousX, previousY, canBounce) : null;
    let satelliteContact: typeof satellite = null;
    let hit: { platform: typeof world.platforms[number]; t: number } | null = null;
    if (this.vy < 0 && canBounce) {
      for (const platform of world.platforms) {
        if (platform.used) continue;
        const top = platform.y + radius, bottom = top - config.platformPhysics.catchDepth;
        const drop = previousY - this.y;
        if (drop <= 0) continue;
        let enter = Math.max(0, (previousY - top) / drop);
        let exit = Math.min(1, (previousY - bottom) / drop);
        const halfWidth = platform.width / 2 + radius + config.platformPhysics.sidePadding;
        const left = platform.x - halfWidth, right = platform.x + halfWidth;
        const travelX = this.x - previousX;
        if (travelX === 0) {
          if (previousX < left || previousX > right) continue;
        } else {
          const a = (left - previousX) / travelX, b = (right - previousX) / travelX;
          enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
        // Sweep through a shallow catch region, including sideways entry just below the top.
        if (enter <= exit && (!hit || enter < hit.t)) hit = { platform, t: enter };
      }
    }
    if (satellite && (!hit || satellite.time <= hit.t)) {
      satelliteContact = world.satellites.resolve(this, previousX, previousY, satellite);
    } else if (hit) {
      this.x = previousX + (this.x - previousX) * hit.t;
      this.y = previousY + (this.y - previousY) * hit.t;
      const minimum = config.platforms[hit.platform.tier].minimumBounce;
      this.reboundVelocity = Math.min(minimum * config.platformPhysics.maxBounceRatio, Math.max(minimum, Math.abs(this.vy) * config.platformPhysics.reboundRetention));
      this.reboundAge = 0;
      this.vy = 0;
      this.vx *= config.platformPhysics.horizontalRetention;
      platformCents = world.bounce(hit.platform).platformCents;
      // Consume the rest of the contact step instead of snapping/stalling at the platform.
      const remaining = dt * (1 - hit.t);
      this.applyRebound(remaining);
      this.x += this.vx * remaining; this.y += this.vy * remaining;
    }
    this.grounded = this.y <= radius;
    if (this.grounded) {
      this.y = radius;
      // Free aiming can start below ground; an upward launch keeps its energy as it emerges.
      if (this.vy <= 0) {
        const rebound = Math.abs(this.vy) * p.bounce;
        this.vy = rebound > p.stopSpeed ? rebound : 0;
        this.vx *= Math.exp(-p.groundFriction * dt);
        if (Math.abs(this.vx) < 2) this.vx = 0;
      }
    }
    this.rotation = (this.rotation + (this.vx / radius + this.vy / 400) * dt) % (Math.PI * 2);
    const rewards = world.collect(previousX, previousY, this.x, this.y);
    rewards.platformCents += platformCents;
    if (satelliteContact) {
      rewards.satellite = satelliteContact;
      if (satelliteContact.landing) rewards.scrap += config.satellites.landingScrap;
    }
    return rewards;
  }
  private applyRebound(dt: number) {
    if (!this.reboundVelocity) return;
    const duration = config.platformPhysics.reboundSeconds;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const before = Math.min(1, this.reboundAge / duration);
    this.reboundAge += dt;
    const after = Math.min(1, this.reboundAge / duration);
    this.vy += this.reboundVelocity * (smooth(after) - smooth(before));
    if (after >= 1) this.reboundVelocity = 0;
  }
}
