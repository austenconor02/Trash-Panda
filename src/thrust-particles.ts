import { config } from './config';
import type { Camera } from './camera';
interface Point { x: number; y: number }
interface Particle extends Point { vx: number; vy: number; age: number; radius: number; swirl: number }
interface Burner extends Point { dx: number; dy: number; power: number }

// Visual-only world-space exhaust. It never changes player momentum, fuel, or collisions.
export class ThrustParticles {
  readonly particles: Particle[] = [];
  private burners: Burner[] = [];
  private credits = [0, 0];
  private boosterTime = 0;
  private time = 0;
  private sprites: HTMLCanvasElement[] = [];
  constructor(private random = Math.random) {}
  reset() { this.particles.length = 0; this.burners = []; this.credits = [0, 0]; this.boosterTime = this.time = 0; }
  update(dt: number, from: Point, to: Point, upward: number, horizontal: number, booster = false) {
    const e = config.exhaust;
    this.time += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.age += dt;
      if (p.age >= e.lifetime) { this.particles.splice(i, 1); continue; }
      const damping = Math.exp(-e.drag * dt);
      p.vx *= damping; p.vy *= damping;
      p.x += (p.vx + Math.sin(p.age * 11 + p.swirl) * p.age * 14) * dt;
      p.y += (p.vy + Math.cos(p.age * 9 + p.swirl) * p.age * 14) * dt;
    }
    this.boosterTime = Math.max(0, this.boosterTime - dt);
    if (booster) this.boosterTime = e.boosterSeconds;
    const rocketPower = this.boosterTime > 0 ? config.upgradeEffects.boosterImpulse / config.propulsion.starterThrust * 1.7 : 0;
    this.burners = [];
    const emit = (dx: number, dy: number, power: number, index: number) => {
      if (power <= 0) { this.credits[index] = 0; return; }
      const strength = Math.min(12, power), scale = Math.sqrt(strength), offset = config.player.radius + 1;
      this.burners.push({ x: to.x + dx * offset, y: to.y + dy * offset, dx, dy, power: strength });
      this.credits[index] += e.particlesPerSecond * scale * dt;
      const count = Math.floor(this.credits[index]); this.credits[index] -= count;
      for (let i = 0; i < count && this.particles.length < e.maxParticles; i++) {
        const t = (i + this.random()) / Math.max(1, count), spread = (this.random() - 0.5) * e.spread * scale;
        const speed = e.speed * scale * (0.55 + this.random() * 0.7);
        this.particles.push({ x: from.x + (to.x - from.x) * t + dx * offset, y: from.y + (to.y - from.y) * t + dy * offset,
          vx: dx * speed - dy * spread, vy: dy * speed + dx * spread,
          age: 0, radius: (2.5 + this.random() * 2.5) * Math.min(2, scale), swirl: this.random() * Math.PI * 2 });
      }
    };
    emit(0, -1, Math.max(upward / config.propulsion.starterThrust, rocketPower), 0);
    emit(-Math.sign(horizontal), 0, Math.abs(horizontal) / config.propulsion.horizontalAcceleration, 1);
  }
  private prepareSprites() {
    if (this.sprites.length) return;
    for (const color of ['255,222,76', '255,133,40', '158,165,170']) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d'); if (!ctx) continue;
      const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, `rgba(${color},0.85)`); glow.addColorStop(0.35, `rgba(${color},0.5)`); glow.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64); this.sprites.push(canvas);
    }
  }
  draw(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number) {
    if (!this.particles.length && !this.burners.length) return;
    this.prepareSprites(); ctx.save();
    // Smoke first; hot yellow/orange motes glow over it without opaque edges.
    for (const smoke of [true, false]) for (const p of this.particles) {
      const t = p.age / config.exhaust.lifetime, isSmoke = t >= 0.36;
      if (isSmoke !== smoke) continue;
      const position = camera.toScreen(p.x, p.y, width, height), radius = p.radius * (1 + t * 3.5);
      if (position.x < -radius || position.x > width + radius || position.y < -radius || position.y > height + radius) continue;
      // Keep overlapping hot motes yellow/orange instead of adding them into white.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (1 - t) ** 1.5 * (smoke ? 0.68 : 0.95);
      const sprite = this.sprites[isSmoke ? 2 : t < 0.15 ? 0 : 1];
      if (sprite) ctx.drawImage(sprite, position.x - radius, position.y - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    for (const burner of this.burners) {
      const p = camera.toScreen(burner.x, burner.y, width, height), scale = Math.sqrt(burner.power);
      const length = (22 + scale * 10) * (0.9 + Math.sin(this.time * 53) * 0.1), flare = 4 + scale * 2;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(-burner.dy, burner.dx));
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 13 + scale * 3);
      glow.addColorStop(0, '#d5ffff'); glow.addColorStop(0.35, '#38caffaa'); glow.addColorStop(1, '#1676ff00');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 13 + scale * 3, 0, Math.PI * 2); ctx.fill();
      const flame = ctx.createLinearGradient(0, 0, length, 0);
      flame.addColorStop(0, '#ecffff'); flame.addColorStop(0.2, '#57dcff'); flame.addColorStop(0.5, '#239dff'); flame.addColorStop(0.85, '#ffe99d99'); flame.addColorStop(1, '#ff9c3500');
      ctx.fillStyle = flame; ctx.beginPath(); ctx.moveTo(-3, -3);
      ctx.quadraticCurveTo(length * 0.35, -flare, length, 0); ctx.quadraticCurveTo(length * 0.35, flare, -3, 3); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
}
