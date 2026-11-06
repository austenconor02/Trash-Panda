import type { Camera } from './camera';
import { groundVariation } from './ground-scene';

const layers = [
  { parallax: .18, spacingX: 2400, spacingY: 1350, width: 280, opacity: .35, drift: 6 },
  { parallax: .34, spacingX: 1900, spacingY: 1200, width: 350, opacity: .5, drift: 10 },
  { parallax: .56, spacingX: 1500, spacingY: 1700, width: 430, opacity: .72, drift: 16 },
] as const;

/** Stable world positions, including leftward travel, with no clouds in orbit. */
export function cloudsInView(cameraX: number, cameraY: number, width: number, height: number, time: number) {
  return layers.flatMap((layer, depth) => {
    const clouds: { x:number; y:number; width:number; opacity:number; variant:number; depth:number }[] = [];
    const firstX = Math.floor((cameraX - (width / 2 + layer.width) / layer.parallax - time * layer.drift) / layer.spacingX);
    const lastX = Math.ceil((cameraX + (width / 2 + layer.width) / layer.parallax - time * layer.drift) / layer.spacingX);
    const firstY = Math.max(0, Math.floor((cameraY - (height / 2 + 180) / layer.parallax) / layer.spacingY));
    const lastY = Math.min(Math.ceil(6500 / layer.spacingY), Math.ceil((cameraY + (height / 2 + 180) / layer.parallax) / layer.spacingY));
    for (let row = firstY; row <= lastY; row++) for (let col = firstX; col <= lastX; col++) {
      const hash = groundVariation(col + row * 7919 + depth * 131);
      const altitude = 320 + row * layer.spacingY + (hash % 211);
      if (altitude > 6500) continue;
      const x = width / 2 + ((col + (hash % 101) / 101 * .5) * layer.spacingX + time * layer.drift - cameraX) * layer.parallax;
      const y = height / 2 - (altitude - cameraY) * layer.parallax;
      const size = layer.width * (.8 + (hash % 43) / 100);
      if (x < -size || x > width + size || y < -140 || y > height + 140) continue;
      const fade = Math.max(0, Math.min(1, (7500 - cameraY) / 2000));
      if (fade) clouds.push({ x, y, width:size, opacity:layer.opacity * fade, variant:hash % 6, depth });
    }
    return clouds;
  });
}

/** Trim the painted atlas once; no image readback or canvas allocation per frame. */
export class CloudScene {
  private sprites: HTMLCanvasElement[] = [];
  get ready() { return this.sprites.length === 6; }
  constructor() {
    if (typeof Image === 'undefined') return;
    const atlas = new Image();
    atlas.onload = () => {
      const sheet = document.createElement('canvas'); sheet.width = atlas.naturalWidth; sheet.height = atlas.naturalHeight;
      const ctx = sheet.getContext('2d'); if (!ctx) return;
      ctx.drawImage(atlas, 0, 0);
      const pixels = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
      const cellWidth = Math.floor(sheet.width / 2), cellHeight = Math.floor(sheet.height / 3);
      for (let variant = 0; variant < 6; variant++) {
        const left = (variant % 2) * cellWidth, top = Math.floor(variant / 2) * cellHeight;
        let x0 = left + cellWidth, y0 = top + cellHeight, x1 = left, y1 = top;
        for (let y = top; y < top + cellHeight; y++) for (let x = left; x < left + cellWidth; x++) {
          if (pixels[(y * sheet.width + x) * 4 + 3] < 8) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        if (x1 <= x0 || y1 <= y0) continue;
        const canvas = document.createElement('canvas'); canvas.width = x1 - x0 + 1; canvas.height = y1 - y0 + 1;
        canvas.getContext('2d')?.drawImage(sheet, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        this.sprites.push(canvas);
      }
    };
    atlas.src = '/assets/junkyard-cloud-atlas.png';
  }
  draw(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, time: number) {
    if (!this.sprites.length) return;
    for (const cloud of cloudsInView(camera.x, camera.y, width, height, time)) {
      ctx.save(); ctx.globalAlpha = cloud.opacity;
      const sprite = this.sprites[cloud.variant]; if (!sprite) { ctx.restore(); continue; }
      const h = cloud.width * sprite.height / sprite.width;
      ctx.drawImage(sprite, cloud.x - cloud.width / 2, cloud.y - h / 2, cloud.width, h);
      ctx.restore();
    }
  }
}
