import { config } from './config';
import { dollars } from './economy';
import { temperatureAtAltitude, temperatureDamage } from './temperature';
import { gravityScaleAtAltitude } from './physics';
import { hudLayout, basicRadarDetects } from './hud-layout';
import type { HudRect, HudFrame, HudLayout } from './hud-layout';
import type { Player } from './player';
import type { Scoring } from './scoring';
import type { FlightEquipment } from './flight-equipment';
import type { SaveData } from './saves';
import type { World } from './world';
import { coldFeedback } from './cold-effects';
import { deployables } from './deployables';
import { itemArt } from './item-art';

const clamp = (value:number) => Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
const feet = (value:number) => `${Math.round(Math.max(0,value)).toLocaleString()} ft`;
export class FlightHud {
  private artwork: Partial<Record<'desktop'|'mobile',HTMLImageElement>> = {};
  private fractions = new Map<string,number>();
  private previousTime = 0;
  private previousHealth = 100;
  private healthWarningUntil = 0;
  constructor() {
    if(typeof Image==='undefined')return;
    for(const source of ['desktop','mobile'] as const){
      const image = new Image(); image.onload=()=>{this.artwork[source]=image;};
      image.src=`/assets/hud-${source}.png`;
    }
  }
  draw(ctx:CanvasRenderingContext2D,width:number,height:number,player:Player,score:Scoring,equipment:FlightEquipment,data:SaveData,
    world:World|undefined,time:number,boot:number,reducedMotion:boolean):HudLayout {
    const layout=hudLayout(width,height), altitude=Math.max(0,player.y*config.feetPerUnit);
    const dt=Math.max(0,Math.min(.1,time-this.previousTime));this.previousTime=time;
    if(equipment.healthDraining||equipment.health<this.previousHealth-.001)this.healthWarningUntil=time+.35;
    this.previousHealth=equipment.health;
    const coldState=coldFeedback(altitude,data.levels.suit,equipment.health,data.tier);
    ctx.save();
    this.frame(ctx,layout.left);this.frame(ctx,layout.right);
    for(const frame of layout.items)this.frame(ctx,frame);
    this.screen(ctx,layout.altitude,boot,time,()=>this.readout(ctx,layout.altitude,'ALTITUDE',feet(altitude),layout.compact?11:24));
    this.screen(ctx,layout.distance,boot,time,()=>this.readout(ctx,layout.distance,'DISTANCE',feet(score.distance),layout.compact?11:12));
    this.screen(ctx,layout.money,boot,time,()=>this.readout(ctx,layout.money,'CASH COLLECTED',dollars(score.collectedCents),layout.compact?11:20));
    this.resource(ctx,layout.fuel,'FUEL',equipment.fuel,equipment.capacity,data.levels.jetpack?`${equipment.fuel.toFixed(1)}/${equipment.capacity.toFixed(1)} GAL`:'LOCKED','#edcd76',equipment.fuelDraining,time,dt,boot,reducedMotion);
    this.resource(ctx,layout.oxygen,'OXYGEN',equipment.oxygen,equipment.oxygenCapacity,`${equipment.oxygen.toFixed(0)}/${equipment.oxygenCapacity.toFixed(0)} S`,'#91e3d6',equipment.oxygenDraining,time,dt,boot,reducedMotion);
    this.resource(ctx,layout.health,'HEALTH',equipment.health,config.survival.baseHealth,`${Math.ceil(equipment.health)}/${config.survival.baseHealth}`,'#b1ed9a',time<this.healthWarningUntil,time,dt,boot,reducedMotion,coldState.barIce);
    const gravity=gravityScaleAtAltitude(altitude,data.tier),temperature=temperatureAtAltitude(altitude,data.tier);
    const cold=temperatureDamage(altitude,data.levels.suit,data.tier)>0;
    this.screen(ctx,layout.gravity,boot,time,()=>this.readout(ctx,layout.gravity,layout.compact?'G':'GRAVITY',`${gravity<0?'↑':'↓'} ${Math.round(Math.abs(gravity)*100)}%`,layout.compact?9:13));
    this.screen(ctx,layout.temperature,boot,time,()=>this.readout(ctx,layout.temperature,'TEMP',`${Math.round(temperature)}°F`,layout.compact?9:13,cold?'#ffc18d':undefined));
    this.radar(ctx,layout,player,world,data.levels.radar,time,boot,reducedMotion);
    deployables.forEach((item,index)=>{
      const label=item.shortLabel,key=item.key,count=data.inventory[item.item];
      const frame=layout.items[index].rect,screen={x:frame.x+frame.width*.17,y:frame.y+frame.height*.17,width:frame.width*.66,height:frame.height*.66};
      this.screen(ctx,screen,boot,time,()=>{
        const color=count?'#c5f6b1':'#718574';
        this.fitted(ctx,label,screen.x+screen.width/2,screen.y+screen.height*.12,screen.width,Math.max(6,frame.width*.105),color,'center');
        const hasArt=item.art&&itemArt.draw(ctx,item.art,screen.x+screen.width*.09,screen.y+screen.height*.24,screen.width*.82,screen.height*.52,0,count?1:.3);
        if(!hasArt)this.fitted(ctx,String(count),screen.x+screen.width/2,screen.y+screen.height*.55,screen.width,frame.width*.3,color,'center');
        else this.fitted(ctx,String(count),screen.x+screen.width-1,screen.y+screen.height*.87,screen.width*.4,frame.width*.2,color,'right');
        this.fitted(ctx,`[${key}]`,hasArt?screen.x:screen.x+screen.width/2,screen.y+screen.height*.87,hasArt?screen.width*.5:screen.width,Math.max(6,frame.width*.12),'#a3c69c',hasArt?'left':'center');
      });
    });
    this.fitted(ctx,`SCRAP ${score.scrap.toLocaleString()}`,layout.footer.x,layout.footer.y+12,layout.footer.width,layout.compact?9:10,'#b2d7a5');
    ctx.restore();return layout;
  }
  private frame(ctx:CanvasRenderingContext2D,frame:HudFrame){
    const image=this.artwork[frame.source],s=frame.crop,d=frame.rect;
    if(image)ctx.drawImage(image,s.x,s.y,s.width,s.height,d.x,d.y,d.width,d.height);
    else {ctx.fillStyle='#11251be8';ctx.fillRect(d.x,d.y,d.width,d.height);ctx.strokeStyle='#a88346';ctx.strokeRect(d.x,d.y,d.width,d.height);}
  }
  private screen(ctx:CanvasRenderingContext2D,slot:HudRect,boot:number,time:number,draw:()=>void){
    ctx.save();ctx.beginPath();ctx.rect(slot.x,slot.y,slot.width,slot.height*clamp(boot));ctx.clip();
    draw();
    ctx.fillStyle='#071b0d20';for(let y=slot.y;y<slot.y+slot.height;y+=3)ctx.fillRect(slot.x,y,slot.width,1);
    if(boot<1){ctx.fillStyle='#d7ffb955';ctx.fillRect(slot.x,slot.y+slot.height*boot-2,slot.width,2);}
    ctx.restore();
  }
  private readout(ctx:CanvasRenderingContext2D,slot:HudRect,label:string,value:string,maxSize:number,color='#d6ffc1'){
    if(slot.height<20){
      this.fitted(ctx,label,slot.x+3,slot.y+slot.height*.5,slot.width*.39,Math.min(8,slot.height*.48),'#8eb68c');
      this.fitted(ctx,value,slot.x+slot.width-3,slot.y+slot.height*.5,slot.width*.6,maxSize,color,'right');
    }else{
      this.fitted(ctx,label,slot.x+3,slot.y+slot.height*.2,slot.width-6,Math.min(9,slot.height*.23),'#8eb68c');
      this.fitted(ctx,value,slot.x+3,slot.y+slot.height*.67,slot.width-6,Math.min(maxSize,slot.height*.53),color);
    }
  }
  private resource(ctx:CanvasRenderingContext2D,slot:HudRect,label:string,value:number,maximum:number,detail:string,color:string,draining:boolean,
    time:number,dt:number,boot:number,reducedMotion:boolean,ice=0){
    const target=maximum>0?clamp(value/maximum):0,previous=this.fractions.get(label)??target;
    const fraction=reducedMotion?target:previous+(target-previous)*(1-Math.exp(-dt*12));this.fractions.set(label,fraction);
    const health=label==='HEALTH',danger=health?clamp((.5-target)/.5):0;
    const alert=maximum>0&&(target<=.2||health&&(draining||target<.5)),tint=alert?'#ff776c':color;
    const pulse=reducedMotion?1:.5+.5*Math.sin(time*(5+danger*5));
    const warning=health&&(draining||target<.5);
    if(warning){ctx.save();ctx.strokeStyle=tint;ctx.lineWidth=1+danger;ctx.shadowColor=tint;ctx.shadowBlur=(draining?4:2)+danger*10+pulse*(2+danger*5);ctx.globalAlpha=.4+danger*.35;ctx.strokeRect(slot.x-1,slot.y-1,slot.width+2,slot.height+2);ctx.restore();}
    this.screen(ctx,slot,boot,time,()=>{
      ctx.save();
      if(warning&&!reducedMotion)ctx.translate(Math.sin(time*43)*(.25+danger*1.2),Math.cos(time*37)*(.15+danger*.45));
      ctx.fillStyle='#06160ec9';ctx.fillRect(slot.x,slot.y,slot.width,slot.height);
      ctx.save();ctx.globalAlpha=.38;ctx.fillStyle=tint;ctx.fillRect(slot.x,slot.y,slot.width*clamp(fraction),slot.height);ctx.restore();
      ctx.fillStyle=tint;ctx.fillRect(slot.x,slot.y+slot.height-2,slot.width*clamp(fraction),2);
      if(health&&target<.5){ctx.save();ctx.globalAlpha=(.08+danger*.2)*(.35+pulse*.65);ctx.fillStyle='#ff4d48';ctx.fillRect(slot.x,slot.y,slot.width,slot.height);ctx.restore();}
      if(ice>0){
        ctx.save();ctx.globalAlpha=.2+ice*.6;ctx.strokeStyle='#d8f5ff';ctx.lineWidth=.7;
        for(const edge of [slot.y+.5,slot.y+slot.height-.5]){ctx.beginPath();ctx.moveTo(slot.x,edge);for(let i=1;i<=12;i++)ctx.lineTo(slot.x+slot.width*i/12,edge+(edge<slot.y+slot.height/2?1:-1)*(i%2?1+ice*2:0));ctx.stroke();}ctx.restore();
      }
      if(draining&&!reducedMotion){ctx.save();ctx.globalAlpha=.2+.15*Math.sin(time*7);ctx.fillStyle=tint;ctx.fillRect(slot.x+slot.width*clamp(fraction)-2,slot.y,2,slot.height);ctx.restore();}
      const size=Math.min(9,slot.height*.85);
      this.fitted(ctx,label,slot.x+3,slot.y+slot.height*.48,slot.width*.36,size*.85,'#d4e8be');
      this.fitted(ctx,detail,slot.x+slot.width-3,slot.y+slot.height*.48,slot.width*.61,size,'#e2ffd1','right');
      ctx.restore();
    });
  }
  private radar(ctx:CanvasRenderingContext2D,layout:HudLayout,player:Player,world:World|undefined,level:number,time:number,boot:number,reducedMotion:boolean){
    const {x,y,radius}=layout.radar;
    ctx.save();ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();
    this.screen(ctx,{x:x-radius,y:y-radius,width:radius*2,height:radius*2},boot,time,()=>{
      if(!level){
        this.fitted(ctx,'RADAR',x,y-7,radius*1.7,Math.min(13,radius*.23),'#91a98e','center');
        this.fitted(ctx,'OFFLINE',x,y+9,radius*1.7,Math.min(15,radius*.26),'#b59c72','center');return;
      }
      ctx.strokeStyle='#8ed48e35';ctx.lineWidth=1;
      for(const fraction of [.33,.66,1]){ctx.beginPath();ctx.arc(x,y,radius*fraction,0,Math.PI*2);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(x-radius,y);ctx.lineTo(x+radius,y);ctx.moveTo(x,y-radius);ctx.lineTo(x,y+radius);ctx.stroke();
      if(!reducedMotion){const angle=time*.9;ctx.strokeStyle='#b5ffb37a';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius);ctx.stroke();}
      const scale=radius/2100;
      for(const platform of world?.platforms??[]){
        if(platform.used||level===1&&!basicRadarDetects(platform.id))continue;
        const mx=(platform.x-player.x)*scale,my=-(platform.y-player.y)*scale;
        if(Math.hypot(mx,my)>radius-3)continue;
        ctx.fillStyle=level>=3?config.platforms[platform.tier].color:'#a6e9a0';
        const w=level>=2?Math.max(5,platform.width*scale):3;
        ctx.fillRect(x+mx-w/2,y+my-1.5,w,3);
      }
      ctx.fillStyle='#eeffdc';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();
      this.fitted(ctx,`RADAR ${level}/3`,x,y+radius*.73,radius*1.3,Math.min(10,radius*.16),'#b2e7aa','center');
    });ctx.restore();
  }
  private fitted(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,maxSize:number,color:string,align:CanvasTextAlign='left'){
    let size=Math.max(5,maxSize);ctx.font=`${size}px monospace`;
    while(size>5&&ctx.measureText(text).width>Math.max(1,width)){size-=.5;ctx.font=`${size}px monospace`;}
    ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y,Math.max(1,width));
  }
}
