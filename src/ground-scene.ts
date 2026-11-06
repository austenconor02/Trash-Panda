import { config } from './config';
import type { Camera } from './camera';

type Strip = { width: number; height: number; speed: number; baseline: number };

/** Floor also covers travel left of launch. Only visible tiles are requested. */
export function groundTileRange(cameraX: number, viewportWidth: number, tileWidth: number, speed: number) {
  const left = cameraX * speed - viewportWidth / 2;
  return { first: Math.floor(left / tileWidth), last: Math.floor((left + viewportWidth) / tileWidth) };
}

/** Coordinate hash: decorations never reroll on return or retain old chunks. */
export function groundVariation(index: number) {
  let hash = Math.imul(index | 0, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export class GroundScene {
  private layers: HTMLCanvasElement[] = [];
  private props: HTMLCanvasElement[] = [];
  get ready() { return this.layers.length === 4 && this.props.length === 4; }

  constructor() {
    if (typeof Image === 'undefined') return;
    const atlas = new Image();
    atlas.onload = () => {
      // Cache strips once: no image readback or canvas allocation per frame.
      this.layers = Array.from({ length: 4 }, (_, row) => {
        const canvas = document.createElement('canvas');
        const rows = config.groundScene.atlasRows;
        const sourceY = rows[row] * atlas.naturalHeight / 1024;
        const sourceHeight = (rows[row + 1] - rows[row]) * atlas.naturalHeight / 1024;
        canvas.width = atlas.naturalWidth; canvas.height = sourceHeight;
        canvas.getContext('2d')?.drawImage(atlas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, canvas.height);
        return canvas;
      });
      // Extract individual foreground clusters and feather their pavement footing.
      // This avoids stamping miniature rectangular landscape sections onto the floor.
      this.props = [[30, 210], [230, 100], [730, 290], [1310, 226]].map(([x, width]) => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = this.layers[3].height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        ctx.drawImage(this.layers[3], x, 0, width, canvas.height, 0, 0, width, canvas.height);
        ctx.globalCompositeOperation = 'destination-in';
        const footing = ctx.createLinearGradient(0, 0, 0, canvas.height);
        footing.addColorStop(0, '#fff'); footing.addColorStop(0.85, '#fff'); footing.addColorStop(1, 'transparent');
        ctx.fillStyle = footing; ctx.fillRect(0, 0, width, canvas.height);
        const sides = ctx.createLinearGradient(0, 0, width, 0);
        sides.addColorStop(0, 'transparent'); sides.addColorStop(0.07, '#fff');
        sides.addColorStop(0.93, '#fff'); sides.addColorStop(1, 'transparent');
        ctx.fillStyle = sides; ctx.fillRect(0, 0, width, canvas.height);
        return canvas;
      });
    };
    atlas.src = '/assets/junkyard-parallax-atlas.png';
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number) {
    const groundY = camera.toScreen(0, 0, width, height).y;
    const settings = config.groundScene;
    if (this.layers.length) {
      this.strip(ctx, this.layers[0], settings.distant, camera.x, groundY, width, height);
      this.strip(ctx, this.layers[1], settings.buildings, camera.x, groundY, width, height);
      this.strip(ctx, this.layers[2], settings.pavement, camera.x, groundY, width, height);
      this.details(ctx, camera.x, groundY, width, height);
    }
  }

  /** Foreground draws after the character, below the playable ground plane. */
  drawForeground(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number) {
    if (!this.layers.length) return;
    const groundY = camera.toScreen(0, 0, width, height).y;
    this.strip(ctx, this.layers[3], config.groundScene.foreground, camera.x, groundY, width, height);
  }

  private strip(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, settings: Strip, cameraX: number, groundY: number, width: number, height: number) {
    const top = groundY + settings.baseline - settings.height;
    if (top > height || top + settings.height < 0) return;
    const { first, last } = groundTileRange(cameraX, width, settings.width, settings.speed);
    for (let tile = first; tile <= last; tile++) {
      const x = width / 2 + tile * settings.width - cameraX * settings.speed;
      // Reflection makes both sides share edge pixels. One-pixel overlap avoids
      // hairline gaps at fractional camera positions, including negative tiles.
      ctx.save();
      ctx.translate(x + (tile % 2 ? settings.width : 0), top);
      ctx.scale(tile % 2 ? -1 : 1, 1);
      ctx.drawImage(image, 0, 0, settings.width + 1, settings.height);
      ctx.restore();
    }
  }

  private details(ctx: CanvasRenderingContext2D, cameraX: number, groundY: number, width: number, height: number) {
    if (groundY > height || groundY + 120 < 0) return;
    const spacing = 570;
    const { first, last } = groundTileRange(cameraX, width + spacing * 2, spacing, 1);
    for (let tile = first; tile <= last; tile++) {
      const seed = groundVariation(tile);
      const x = width / 2 + tile * spacing - cameraX + seed % 90;
      const prop = this.props[seed % this.props.length];
      const propHeight = 70 + seed % 35;
      ctx.drawImage(prop, x, groundY + 20 + seed % 20, prop.width / prop.height * propHeight, propHeight);
    }
  }
}
