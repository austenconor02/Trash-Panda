import { config } from './config';
import type { Player } from './player';
import type { FlightEquipment } from './flight-equipment';
import { PlayerAnimation, animationClips } from './player-animation';
import type { PlayerPose } from './player-animation';
import { playerAtlases } from './player-animation-assets';
import type { PlayerAtlas } from './player-animation-assets';
import { buildSpriteFrame } from './sprite-geometry';
import type { SpriteRect } from './sprite-geometry';
import { extractAtlasRow } from './atlas-extraction';

interface Frame {
  x: number; y: number; width: number; height: number; image: HTMLImageElement; scale: number;
  pivotX?: number; pivotY?: number; floorY?: number; mirror?: boolean;
}
const flightPoses = ['thrustLeft','thrustRight','brakeRight','brakeLeft','turnLeft','turnRight','thrustUp'] as const;
export const flightFrameCounts = Object.fromEntries(flightPoses.map(pose => [pose, animationClips[pose].frames])) as Record<typeof flightPoses[number], number>;

/** Artwork registration and playback never alter the circular collision body. */
export class PlayerSprite {
  readonly animation = new PlayerAnimation();
  readonly ready: Promise<void>;
  readonly loadErrors: string[] = [];
  private frames = new Map<PlayerPose, Frame[]>();
  private blendCanvas: HTMLCanvasElement | null = null;
  get pose() { return this.animation.pose; }
  set pose(pose: PlayerPose) { this.animation.pose = pose; }
  get frameIndex() { return this.animation.frameIndex; }
  set frameIndex(frame: number) { this.animation.frameIndex = frame; }
  get aimingFrame() { return this.animation.aimingFrame; }

  constructor() {
    this.ready = typeof Image === 'undefined' ? Promise.resolve() : Promise.all(
      playerAtlases.map(atlas => this.load(atlas.src, image => this.readAtlas(image, atlas)))
    ).then(() => {});
  }
  private load(src: string, read: (image: HTMLImageElement) => void) {
    return new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => { try { read(image); } catch { this.loadErrors.push(src); } resolve(); };
      image.onerror = () => { this.loadErrors.push(src); resolve(); };
      image.src = src;
    });
  }
  private pixels(image: HTMLImageElement) {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Sprite canvas unavailable');
    ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  private readAtlas(image: HTMLImageElement, atlas: PlayerAtlas) {
    const pixels = this.pixels(image);
    const rows = new Map<number, SpriteRect[]>();
    for (const clip of atlas.clips) {
      const frames: Frame[] = [];
      for (let index = 0; index < clip.frameCount; index++) {
        const column = index % atlas.columns, row = clip.row + Math.floor(index / atlas.columns);
        if (!rows.has(row)) rows.set(row, extractAtlasRow(pixels,image.naturalWidth,image.naturalHeight,row,atlas.rows,atlas.columns));
        const x = Math.floor(column * image.naturalWidth / atlas.columns), y = Math.floor(row * image.naturalHeight / atlas.rows);
        const logical = { x, y, width: Math.floor((column + 1) * image.naturalWidth / atlas.columns) - x, height: Math.floor((row + 1) * image.naturalHeight / atlas.rows) - y };
        const figure = rows.get(row)![column];
        const cell = { x: Math.min(logical.x,figure.x), y: Math.min(logical.y,figure.y), width: 0, height: 0 };
        cell.width = Math.max(logical.x+logical.width,figure.x+figure.width)-cell.x;
        cell.height = Math.max(logical.y+logical.height,figure.y+figure.height)-cell.y;
        const bounds = { x: figure.x-cell.x, y: figure.y-cell.y, width: figure.width, height: figure.height };
        const headWidth = typeof clip.headWidth === 'number' ? clip.headWidth : clip.headWidth[index];
        const pivot = typeof clip.pivot[0] === 'number' ? clip.pivot as readonly [number,number] : (clip.pivot as readonly (readonly [number,number])[])[index];
        const floor = typeof clip.floor === 'number' || clip.floor === undefined ? clip.floor : clip.floor[index];
        // A hand may cross a nominal grid seam. Expand the source cell while
        // retaining the authored scale and root in the original coordinate frame.
        const root: readonly [number,number] = [(logical.x+pivot[0]*logical.width-cell.x)/cell.width,(logical.y+pivot[1]*logical.height-cell.y)/cell.height];
        const foot = floor === undefined ? undefined : (logical.y+floor*logical.height-cell.y)/cell.height;
        frames.push(this.register(image, cell, bounds, headWidth*logical.width/cell.width, root, foot, clip.mirror));
      }
      this.frames.set(clip.pose, frames);
    }
  }
  private register(image: HTMLImageElement, cell: SpriteRect, bounds: SpriteRect, headWidth: number, pivot: readonly [number,number], floor?: number, mirror = false): Frame {
    const geometry = buildSpriteFrame(cell, bounds, { headWidth, pivot, floor }, config.playerVisuals.headSize);
    return { ...geometry.crop, image, scale: geometry.scale, pivotX: geometry.pivotX, pivotY: geometry.pivotY, floorY: geometry.floorY, mirror };
  }
  reset() { this.animation.reset(); }
  beginLaunch(direction: number) { this.animation.beginLaunch(direction); }
  updateAiming(dt: number) { this.animation.updateAiming(dt); }
  update(dt: number, player: Player, equipment: FlightEquipment, booster = false, platformBounce = false, _noSuit = true, impact = false, crashing = false) {
    this.animation.update(dt, player, equipment, booster, platformBounce, impact, crashing);
  }

  /** Developer previews use the same registered frames as live flight. */
  drawPose(ctx: CanvasRenderingContext2D, x: number, y: number, pose: PlayerPose, index: number, facing = 1, grounded = false) {
    const frames = this.frames.get(pose), frame = frames?.[Math.max(0,Math.min(index,(frames?.length ?? 1)-1))];
    if (!frame) return false;
    const width = frame.width*frame.scale, height=frame.height*frame.scale;
    const left = -(frame.pivotX ?? width/2), top = grounded ? config.player.radius-(frame.floorY ?? height) : -(frame.pivotY ?? height/2);
    const mirror = !!frame.mirror !== ((pose === 'recovery' || pose === 'falling' || pose === 'launch') && facing < 0);
    if (mirror) {ctx.save();ctx.translate(x,y);ctx.scale(-1,1);ctx.drawImage(frame.image,frame.x,frame.y,frame.width,frame.height,left,top,width,height);ctx.restore();}
    else ctx.drawImage(frame.image,frame.x,frame.y,frame.width,frame.height,x+left,y+top,width,height);
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, aiming: boolean) {
    if (aiming) return this.drawPose(ctx,x,y,'cannonball',this.aimingFrame);
    const animation=this.animation;
    if(animation.blend<1&&this.frames.has(animation.previousPose)&&this.frames.has(this.pose)&&typeof document!=='undefined'){
      // Blend on a transparent layer so the character doesn't dim or brighten
      // the scenery beneath it halfway through an airborne pose change.
      this.blendCanvas ??= document.createElement('canvas'); const size=192;
      if(this.blendCanvas.width!==size*2){this.blendCanvas.width=this.blendCanvas.height=size*2;}
      const layer=this.blendCanvas.getContext('2d');
      if(layer){
        layer.setTransform(2,0,0,2,0,0);layer.clearRect(0,0,size,size);
        layer.globalCompositeOperation='source-over';layer.globalAlpha=1-animation.blend;
        this.drawPose(layer,size/2,size/2,animation.previousPose,animation.previousFrameIndex,animation.previousFacing);
        layer.globalCompositeOperation='lighter';layer.globalAlpha=animation.blend;
        this.drawPose(layer,size/2,size/2,this.pose,this.frameIndex,animation.facing);
        layer.globalAlpha=1;layer.globalCompositeOperation='source-over';
        ctx.drawImage(this.blendCanvas,x-size/2,y-size/2,size,size);return true;
      }
    }
    return this.drawPose(ctx,x,y,this.pose,this.frameIndex,animation.facing,animation.grounded);
  }
}
