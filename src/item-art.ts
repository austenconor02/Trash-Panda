export type ItemArtKey = 'booster' | 'teleporter' | 'scrap' | 'scrapAlt';
export const itemArtUrls: Record<ItemArtKey, string> = {
  booster: '/assets/deployable-booster.png',
  teleporter: '/assets/deployable-teleporter.png',
  scrap: '/assets/orbital-scrap.png',
  scrapAlt: '/assets/orbital-scrap-alt.png',
};

interface Artwork { image:HTMLImageElement; x:number; y:number; width:number; height:number }

/** Shared, alpha-trimmed originals for world pickups, HUD slots, and garage tiles. */
export class ItemArtwork {
  private images = new Map<ItemArtKey, Artwork>();
  readonly ready: Promise<void>;
  constructor() {
    if (typeof Image === 'undefined') { this.ready = Promise.resolve(); return; }
    this.ready = Promise.all((Object.entries(itemArtUrls) as [ItemArtKey,string][]).map(([key,url]) => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => {
        const artwork: Artwork = { image, x:0, y:0, width:image.naturalWidth, height:image.naturalHeight };
        try {
          // One readback per source; only the trim bounds are cached, never edited pixels.
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image,0,0);
            const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
            let left=canvas.width, top=canvas.height, right=-1, bottom=-1;
            for (let y=0; y<canvas.height; y++) for (let x=0; x<canvas.width; x++) {
              if (pixels[(y*canvas.width+x)*4+3] < 8) continue;
              left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
            }
            if (right>=left && bottom>=top) {
              artwork.x=Math.max(0,left-2); artwork.y=Math.max(0,top-2);
              artwork.width=Math.min(canvas.width,right+3)-artwork.x; artwork.height=Math.min(canvas.height,bottom+3)-artwork.y;
            }
          }
        } catch { /* Original transparent artwork still draws if readback is unavailable. */ }
        if (artwork.width>0 && artwork.height>0) this.images.set(key,artwork);
        resolve();
      };
      image.onerror = () => resolve();
      image.src = url;
    }))).then(() => {});
  }
  /** x/y are the top-left of the contain-fit box; rotation is about its center. */
  draw(ctx:CanvasRenderingContext2D,key:ItemArtKey,x:number,y:number,width:number,height:number,rotation=0,opacity=1):boolean {
    const artwork=this.images.get(key);
    if (!artwork || !Number.isFinite(width+height+x+y) || width<=0 || height<=0) return false;
    const scale=Math.min(width/artwork.width,height/artwork.height), w=artwork.width*scale, h=artwork.height*scale;
    ctx.save(); ctx.translate(x+width/2,y+height/2); if (Number.isFinite(rotation) && rotation) ctx.rotate(rotation);
    ctx.globalAlpha*=Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):1;
    ctx.drawImage(artwork.image,artwork.x,artwork.y,artwork.width,artwork.height,-w/2,-h/2,w,h);
    ctx.restore(); return true;
  }
}

export const itemArt = new ItemArtwork();
