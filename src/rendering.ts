import { config } from './config';
import { drawAtmosphere } from './atmosphere';
import { Camera } from './camera';
import type { Player } from './player';
import type { Slingshot } from './slingshot';
import type { World } from './world';
import { magnetPosition } from './world';
import type { FlightEquipment } from './flight-equipment';
import type { SaveData } from './saves';
import { mission } from './progression';
import type { ThrustParticles } from './thrust-particles';
import { prepareNebula } from './cosmos';
import { PlayerSprite } from './player-sprite';
import { GroundScene } from './ground-scene';
import { drawHoverPlatform, drawSpinningCoin } from './world-visuals';
import { SatelliteSprite } from './satellite-sprite';
import { CloudScene } from './cloud-scene';
import { ColdOverlay, coldFeedback } from './cold-effects';
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  width = 0; height = 0;
  readonly playerSprite = new PlayerSprite();
  readonly groundScene = new GroundScene();
  readonly cloudScene = new CloudScene();
  private coldOverlay = new ColdOverlay();
  readonly satelliteSprite = new SatelliteSprite();
  private tabletBackdrop: HTMLCanvasElement | null = null;
  private tabletBackdropKey = '';
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx; this.resize();
    void this.playerSprite.ready.then(() => { this.tabletBackdropKey = ''; });
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => prepareNebula());
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width; this.height = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.tabletBackdropKey = '';
  }
  /** A cached launch-area view keeps the terminal grounded in the actual world. */
  drawTabletBackdrop(sling: Slingshot, data: SaveData) {
    const key = [this.width, this.height, data.tier, data.launcherTier, data.levels.height, data.levels.width, data.levels.strength, this.groundScene.ready, this.cloudScene.ready].join(':');
    if (!this.tabletBackdrop || this.tabletBackdropKey !== key) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scene = document.createElement('canvas');
      scene.width = Math.round(this.width * dpr); scene.height = Math.round(this.height * dpr);
      const ctx = scene.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const camera = new Camera(), w = this.width / camera.zoom, h = this.height / camera.zoom;
      camera.y = h * (config.camera.groundScreenRatio - .5);
      const screen = (x: number, y: number) => camera.toScreen(x, y, w, h);
      ctx.save(); ctx.scale(camera.zoom, camera.zoom);
      drawAtmosphere(ctx, w, h, camera.y + (data.tier === 'moon' ? config.destinations.moon.milestoneFeet / config.feetPerUnit : 0), 0);
      if (data.tier === 'earth') this.cloudScene.draw(ctx, camera, w, h, 0);
      const ground = screen(0, 0);
      ctx.fillStyle = data.tier === 'moon' ? '#59616b' : '#39291e'; ctx.fillRect(0, ground.y, w, h - ground.y);
      ctx.fillStyle = data.tier === 'moon' ? '#a7b1bc' : '#624433'; ctx.fillRect(0, ground.y, w, 5);
      if (data.tier === 'earth') this.groundScene.draw(ctx, camera, w, h);
      const pouch = screen(0, sling.restHeight);
      for (const anchor of sling.posts) {
        const post = screen(anchor.x, anchor.y);
        ctx.fillStyle = sling.poleColor; ctx.fillRect(post.x - anchor.thickness / 2, post.y, anchor.thickness, anchor.y);
        ctx.strokeStyle = sling.bandColor; ctx.lineWidth = sling.bandThickness;
        ctx.beginPath(); ctx.moveTo(post.x, post.y); ctx.lineTo(pouch.x, pouch.y); ctx.stroke();
      }
      ctx.fillStyle = '#503422'; ctx.fillRect(pouch.x - 20, pouch.y + 7, 40, 10);
      this.playerSprite.drawPose(ctx, pouch.x, pouch.y, 'cannonball', 0);
      if (data.tier === 'earth') this.groundScene.drawForeground(ctx, camera, w, h);
      ctx.restore();
      this.tabletBackdrop ??= document.createElement('canvas');
      this.tabletBackdrop.width = scene.width; this.tabletBackdrop.height = scene.height;
      const backdrop = this.tabletBackdrop.getContext('2d');
      if (!backdrop) return;
      backdrop.filter = `blur(${6 * dpr}px) saturate(.68)`;
      backdrop.drawImage(scene, -8 * dpr, -8 * dpr, scene.width + 16 * dpr, scene.height + 16 * dpr);
      backdrop.filter = 'none'; backdrop.fillStyle = '#06100b73'; backdrop.fillRect(0, 0, scene.width, scene.height);
      this.tabletBackdropKey = key;
    }
    this.ctx.drawImage(this.tabletBackdrop, 0, 0, this.width, this.height);
  }
  draw(player: Player, sling: Slingshot, camera: Camera, world: World, ready: boolean, equipment: FlightEquipment, data: SaveData, exhaust?: ThrustParticles) {
    const ctx = this.ctx, w = this.width / camera.zoom, h = this.height / camera.zoom;
    ctx.save(); ctx.scale(camera.zoom, camera.zoom);
    const screen = (x: number, y: number) => camera.toScreen(x, y, w, h);
    drawAtmosphere(ctx, w, h, camera.y + (world.planet === 'moon' ? config.destinations.moon.milestoneFeet / config.feetPerUnit : 0), camera.x);
    if (world.planet === 'earth') this.cloudScene.draw(ctx, camera, w, h, world.visualTime);
    const ground = screen(0, 0);
    ctx.fillStyle = world.planet === 'moon' ? '#59616b' : '#39291e'; ctx.fillRect(0, ground.y, w, Math.max(0, h - ground.y));
    ctx.fillStyle = world.planet === 'moon' ? '#a7b1bc' : '#624433'; ctx.fillRect(0, ground.y, w, 5);
    if (world.planet === 'earth') this.groundScene.draw(ctx, camera, w, h);
    const destination = screen(0, world.ceilingY);
    if (destination.y >= 0 && destination.y <= h + 40) {
      ctx.fillStyle = world.planet === 'earth' ? '#59616b' : '#8b4c36'; ctx.fillRect(0, 0, w, destination.y);
      ctx.fillStyle = world.planet === 'earth' ? '#bcc3ca' : '#d88762'; ctx.fillRect(0, destination.y - 4, w, 4);
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(`${mission(world.planet).destination.toUpperCase()} SURFACE`, w / 2 - 65, destination.y - 18);
    }
    for (const platform of world.platforms) {
      const p = screen(platform.x, platform.y);
      if (p.x + platform.width / 2 < -5 || p.x - platform.width / 2 > w + 5 || p.y < -50 || p.y > h + 5) continue;
      drawHoverPlatform(ctx, platform, p.x, p.y, world.visualTime);
    }
    for (const coin of world.coins) {
      const p = screen(coin.x, coin.y);
      if (p.x < -18 || p.x > w + 18 || p.y < -18 || p.y > h + 18) continue;
      if (coin.magnet) {
        for (const behind of [.18, .10]) {
          const trail = magnetPosition(coin, behind), point = screen(trail.x, trail.y);
          ctx.save(); ctx.globalAlpha = behind > .1 ? .12 : .25;
          drawSpinningCoin(ctx, coin, point.x, point.y, world.visualTime - behind); ctx.restore();
        }
      }
      drawSpinningCoin(ctx, coin, p.x, p.y, world.visualTime);
    }
    for (const pickup of world.pickups) {
      const p = screen(pickup.x, pickup.y), t = pickup.age / config.magnets.pickupSeconds;
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = pickup.coin.tier === 'scrap' ? '#7cf5ff' : '#fff0ae'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 7 + t * 20, 0, Math.PI * 2); ctx.stroke();
      ctx.scale(1 - t * .85, 1 - t * .85);
      drawSpinningCoin(ctx, pickup.coin, 0, 0, world.visualTime, false); ctx.restore();
    }
    if (world.planet === 'earth') this.satelliteSprite.draw(ctx, camera, world.satellites, w, h);
    const ball = screen(player.x, player.y);
    for (const anchor of sling.posts) {
      const post = screen(anchor.x, anchor.y);
      ctx.fillStyle = sling.poleColor; ctx.fillRect(post.x - anchor.thickness / 2, post.y, anchor.thickness, anchor.y);
      if (ready) {
        ctx.strokeStyle = sling.bandColor; ctx.lineWidth = sling.bandThickness;
        ctx.beginPath(); ctx.moveTo(post.x, post.y); ctx.lineTo(ball.x, ball.y); ctx.stroke();
      }
    }
    if (ready) { ctx.fillStyle = '#503422'; ctx.fillRect(ball.x - 20, ball.y + 7, 40, 10); }
    if (ready) {
      const v = sling.velocity();
      if (v) {
        const length = Math.hypot(v.x, v.y);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + v.x / length * 65, ball.y - v.y / length * 65); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (!ready) exhaust?.draw(ctx, camera, w, h);
    if (!this.playerSprite.draw(ctx, ball.x, ball.y, ready)) {
      ctx.fillStyle = '#a3a3a3'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, config.player.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // A single short line makes the simulated rotation visible on the ball placeholder.
      ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + Math.cos(player.rotation) * 10, ball.y - Math.sin(player.rotation) * 10); ctx.lineWidth = 2; ctx.stroke();
      if (!ready && data.levels.jetpack) { ctx.fillStyle = '#546873'; ctx.fillRect(ball.x - 7, ball.y + 11, 14, 7); }
    }
    if (!ready && equipment.bootsTime > 0) { ctx.fillStyle = '#35414a'; ctx.fillRect(ball.x - 16, ball.y + 9, 12, 11); ctx.fillRect(ball.x + 4, ball.y + 9, 12, 11); }
    for (const effect of world.effects) {
      const p = screen(effect.x, effect.y);
      ctx.save(); ctx.globalAlpha = 1 - effect.age; ctx.fillStyle = '#fff3ac'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(effect.text, p.x, p.y - 20 - effect.age * 40);
      if (effect.bounce) { ctx.strokeStyle = '#b8ffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 12 + effect.age * 55, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    if (world.planet === 'earth') this.groundScene.drawForeground(ctx, camera, w, h);
    ctx.restore();
    if (world.planet === 'earth') this.satelliteSprite.drawImpact(ctx, world.satellites, this.width, this.height);
    const reducedMotion=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coldOverlay.draw(ctx,this.width,this.height,coldFeedback(player.y*config.feetPerUnit,data.levels.suit,equipment.health,data.tier),world.visualTime,reducedMotion);
    this.canvas.style.cursor = ready ? 'grab' : 'default';
  }
}
export { basicRadarDetects } from './hud-layout';
