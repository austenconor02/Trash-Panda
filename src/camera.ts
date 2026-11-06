import { config } from './config';
export class Camera {
  readonly zoom = config.camera.zoom;
  x = 0; y = 0;
  reset(restHeight: number, height: number) { this.x = 0; this.y = Math.max(height * (config.camera.groundScreenRatio - 0.5), restHeight - height * 0.15); }
  follow(x: number, y: number, dt: number, height: number) {
    const targetY = Math.max(height * (config.camera.groundScreenRatio - 0.5), y - height * 0.15);
    const blend = 1 - Math.exp(-config.camera.followSpeed * dt);
    this.x += (x - this.x) * blend; this.y += (targetY - this.y) * blend;
    // Keep rapid launches visible, including at narrow viewport sizes.
    this.x = Math.max(x - this.viewWidth * 0.38, Math.min(x + this.viewWidth * 0.38, this.x));
    const compact = this.viewWidth * this.zoom < 650;
    // The registered flight root is at the pelvis; the head extends farther
    // above it than a bounding-box-centered sprite did.
    const headroom = config.playerVisuals.spriteSize * .85 + 12 / this.zoom;
    const topInset = compact ? Math.min(height * 0.44, 206 / this.zoom + headroom) : Math.max(height * .12, headroom);
    const bottomInset = compact ? Math.min(height * 0.32, (180 + config.playerVisuals.spriteSize / 2) / this.zoom) : height * 0.12;
    this.y = Math.max(y - height / 2 + topInset, Math.min(y + height / 2 - bottomInset, this.y));
  }
  viewWidth = 1000;
  toScreen(x: number, y: number, width: number, height: number) { return { x: width / 2 + x - this.x, y: height / 2 - y + this.y }; }
  // Drawing uses a world viewport (CSS size / zoom); input arrives in CSS pixels.
  toWorld(x: number, y: number, width: number, height: number) { return { x: (x - width / 2) / this.zoom + this.x, y: (height / 2 - y) / this.zoom + this.y }; }
}
