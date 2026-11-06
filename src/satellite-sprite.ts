import { config } from './config';
import type { Camera } from './camera';
import type { SatelliteField } from './satellites';

export class SatelliteSprite {
  private image: HTMLImageElement | null = null;
  private crop = { x: 0, y: 0, width: 1, height: 1 };
  constructor() {
    if (typeof Image === 'undefined') return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 40) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left) return;
      this.crop = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
      this.image = image;
    };
    image.src = '/assets/orbital-satellite.png';
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, field: SatelliteField, width: number, height: number) {
    const s = config.satellites, margin = s.warningDistance;
    const satellites = field.visible(camera.x - width / 2 - margin, camera.x + width / 2 + margin,
      camera.y - height / 2 - s.height, camera.y + height / 2 + s.height);
    for (const satellite of satellites) {
      const p = camera.toScreen(satellite.x, satellite.y, width, height);
      if (p.x + s.width / 2 < 0 || p.x - s.width / 2 > width) {
        const approaching = p.x < 0 ? satellite.speed > 0 : satellite.speed < 0;
        if (!approaching || p.y < 18 || p.y > height - 18) continue;
        const left = p.x < 0;
        ctx.save(); ctx.font = 'bold 12px monospace'; ctx.textAlign = left ? 'left' : 'right';
        const text = left ? '→ SATELLITE' : 'SATELLITE ←';
        const x = left ? 8 : width - 8;
        ctx.fillStyle = '#171f2be8'; ctx.fillRect(left ? 3 : width - 123, p.y - 16, 120, 28);
        ctx.fillStyle = '#ffd376'; ctx.fillText(text, x, p.y + 3); ctx.restore();
        continue;
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(satellite.speed < 0 ? -1 : 1, 1);
      // Short streaks and a blinking marker make direction readable at game scale.
      ctx.strokeStyle = '#8deaff66'; ctx.lineWidth = 2;
      for (const offset of [-9, 9]) {
        ctx.beginPath(); ctx.moveTo(-s.width / 2 - 6, offset); ctx.lineTo(-s.width / 2 - 30, offset); ctx.stroke();
      }
      if (this.image) {
        const c = this.crop, scale = Math.min(s.width / c.width, s.height / c.height);
        const w = c.width * scale, h = c.height * scale;
        ctx.drawImage(this.image, c.x, c.y, c.width, c.height, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#598ec5'; ctx.fillRect(-76, -17, 52, 34); ctx.fillRect(24, -17, 52, 34);
        ctx.fillStyle = '#e4c9a2'; ctx.fillRect(-24, -23, 48, 46);
        ctx.fillStyle = '#e58b3e'; ctx.fillRect(-20, -17, 8, 34);
      }
      ctx.fillStyle = Math.sin(field.time * 12) > 0 ? '#fff2b2' : '#ef862c';
      ctx.beginPath(); ctx.arc(0, -s.height / 2 - 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const wreck of field.wreckage) {
      const p = camera.toScreen(wreck.x, wreck.y, width, height);
      if (p.x < -300 || p.x > width + 300 || p.y < -300 || p.y > height + 300) continue;
      const fade = Math.min(1, config.satellites.wreckSeconds - wreck.age);
      const c = this.crop, scale = Math.min(s.width / c.width, s.height / c.height);
      const w = c.width * scale, h = c.height * scale;
      for (const part of [-1, 0, 1]) {
        ctx.save(); ctx.globalAlpha = fade;
        ctx.translate(p.x + part * (w / 3 + wreck.age * 36), p.y + Math.abs(part) * wreck.age * 18);
        ctx.rotate(wreck.age * (part === 0 ? .7 : part * 2.2));
        if (this.image) ctx.drawImage(this.image, c.x + (part + 1) * c.width / 3, c.y, c.width / 3, c.height, -w / 6, -h / 2, w / 3, h);
        else { ctx.fillStyle = part ? '#598ec5' : '#e4c9a2'; ctx.fillRect(-24, -16, 48, 32); }
        ctx.restore();
      }
      for (let spark = 0; spark < 5; spark++) {
        ctx.save(); ctx.globalAlpha = fade * Math.max(0, 1 - wreck.age / 1.2);
        ctx.fillStyle = spark % 2 ? '#ffc070' : '#a6f2ff';
        ctx.beginPath(); ctx.arc(p.x + Math.sin(spark * 7) * wreck.age * 130, p.y - wreck.age * (35 + spark * 14), 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
  }

  drawImpact(ctx: CanvasRenderingContext2D, field: SatelliteField, width: number, height: number) {
    if (field.impactFlash <= 0) return;
    ctx.save(); ctx.globalAlpha = 0.18 * field.impactFlash / config.satellites.flashSeconds;
    ctx.fillStyle = '#ff4939'; ctx.fillRect(0, 0, width, height); ctx.restore();
  }
}
