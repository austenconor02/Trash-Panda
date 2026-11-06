export interface HudRect { x:number; y:number; width:number; height:number }
export interface HudFrame { source:'desktop' | 'mobile'; crop:HudRect; rect:HudRect }
export interface HudLayout {
  compact:boolean; left:HudFrame; right:HudFrame; items:HudFrame[];
  altitude:HudRect; distance:HudRect; fuel:HudRect; oxygen:HudRect; health:HudRect; money:HudRect;
  gravity:HudRect; temperature:HudRect; radar:{x:number; y:number; radius:number};
  controlsBottom:number; footer:HudRect;
}
const rect = (x:number, y:number, width:number, height:number):HudRect => ({ x,y,width,height });
/** Coordinates stay in CSS pixels; artwork and live screens resize together. */
export function hudLayout(width:number, height:number):HudLayout {
  const compact = width < 740 || height < 500;
  let left:HudFrame, right:HudFrame, items:HudFrame[];
  const map = (frame:HudFrame, x:number, y:number, w:number, h:number) => rect(
    frame.rect.x + (x - frame.crop.x) * frame.rect.width / frame.crop.width,
    frame.rect.y + (y - frame.crop.y) * frame.rect.height / frame.crop.height,
    w * frame.rect.width / frame.crop.width, h * frame.rect.height / frame.crop.height);
  if (compact) {
    const panelWidth = Math.min(width - 16, height < 500 ? Math.min(380,height) : 520), scale = panelWidth / 911;
    const panelHeight = 341 * scale, bottom = height - 10;
    left = { source:'mobile', crop:rect(15,1287,911,341), rect:rect((width-panelWidth)/2,bottom-panelHeight,panelWidth,panelHeight) };
    const landscape = height < 500 && width > 500;
    const radarWidth = landscape ? Math.min(130,(width-panelWidth)/2-20) : Math.min(156,width*.4,height*.27);
    right = { source:'mobile', crop:rect(486,42,427,458), rect:rect(width-radarWidth-10,landscape?height-10-radarWidth*458/427:64,radarWidth,radarWidth*458/427) };
    const gap=2,columns=width>=386?6:3,size=Math.min(54,(width-112-gap*(columns-1))/columns),first=8;
    items = Array.from({length:6},(_,i)=>({source:'mobile' as const,crop:rect(28,1128,147,150),rect:rect(first+(i%columns)*(size+gap),8+Math.floor(i/columns)*(size+gap),size,size)}));
    const radar = map(right,706,324,0,0);
    return { compact,left,right,items,
      altitude:map(left,544,1332,303,44), distance:map(left,544,1430,303,44), money:map(left,544,1527,303,44),
      fuel:map(left,123,1346,290,29), oxygen:map(left,123,1443,290,29), health:map(left,123,1538,290,29),
      gravity:map(right,551,88,121,42), temperature:map(right,735,88,121,42),
      radar:{...radar,radius:132*right.rect.width/right.crop.width}, controlsBottom:height-left.rect.y+12,
      footer:rect(12,columns===3?128:72,Math.max(100,width-right.rect.width-35),26) };
  }
  const leftWidth = Math.max(195,Math.min(260,width*.19)), rightWidth = Math.max(180,Math.min(254,width*.19));
  left = {source:'desktop',crop:rect(0,0,351,516),rect:rect(12,12,leftWidth,leftWidth*516/351)};
  right = {source:'desktop',crop:rect(1276,0,396,435),rect:rect(width-rightWidth-12,64,rightWidth,rightWidth*435/396)};
  const available = right.rect.x-left.rect.x-leftWidth-24, size = Math.max(36,Math.min(66,(available-30)/6)), gap = 6;
  const start = left.rect.x+leftWidth+12+(available-size*6-gap*5)/2;
  items = Array.from({length:6},(_,i)=>({source:'desktop' as const,crop:rect(352,7,133,135),rect:rect(start+i*(size+gap),12,size,size)}));
  const radar = map(right,1478,263,0,0);
  return {compact,left,right,items,
    altitude:map(left,60,47,241,51),distance:map(left,60,143,241,21),
    fuel:map(left,83,208,194,22),oxygen:map(left,83,275,194,22),health:map(left,83,342,194,22),money:map(left,60,416,241,46),
    gravity:map(right,1340,43,111,34),temperature:map(right,1498,43,126,34),
    radar:{...radar,radius:128*rightWidth/396},controlsBottom:12,
    footer:rect(16,left.rect.y+left.rect.height+5,left.rect.width,28)};
}

/** Stable detection coverage preserves the purchased radar tiers. */
export function basicRadarDetects(id:string) {
  let hash=2166136261;
  for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
  return (hash&1)===0;
}
