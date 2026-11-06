import { config } from './config';
import { temperatureDamage } from './temperature';
import type { Planet } from './progression';
const clamp = (value:number) => Math.max(0,Math.min(1,value));

/** Use the same suit-adjusted cold exposure that actually damages health. */
export function coldFeedback(altitudeFeet:number,suitLevel:number,health:number,planet:Planet='earth') {
  const damageRate=temperatureDamage(altitudeFeet,suitLevel,planet);
  const exposure=clamp(damageRate/config.temperature.maximumDamagePerSecond);
  const healthFraction=clamp(health/config.survival.baseHealth);
  const danger=clamp((.5-healthFraction)/.5);
  const frost=exposure>0?clamp((.08+.35*Math.sqrt(exposure))*(1-healthFraction*.6)+danger*.5*Math.sqrt(exposure)):0;
  return {damageRate,exposure,healthFraction,danger,frost,barIce:danger*Math.sqrt(exposure)};
}

/** Lightweight procedural frost: only the screen edges, leaving the center clear. */
export class ColdOverlay {
  private intensity=0;
  private previousTime=-1;
  draw(ctx:CanvasRenderingContext2D,width:number,height:number,feedback:ReturnType<typeof coldFeedback>,time:number,reducedMotion=false){
    const reset=this.previousTime<0||time<this.previousTime;
    const dt=reset?0:Math.max(0,Math.min(.1,time-this.previousTime));this.previousTime=time;
    this.intensity=reset||reducedMotion?feedback.frost:this.intensity+(feedback.frost-this.intensity)*(1-Math.exp(-dt*3.5));
    const frost=this.intensity;if(frost<.008)return;
    const depth=Math.min(145,Math.min(width,height)*(.045+.19*frost));
    ctx.save();
    const edge=(x0:number,y0:number,x1:number,y1:number,x:number,y:number,w:number,h:number)=>{
      const gradient=ctx.createLinearGradient(x0,y0,x1,y1);
      gradient.addColorStop(0,`rgba(203,237,255,${frost*.57})`);
      gradient.addColorStop(.38,`rgba(140,203,238,${frost*.22})`);gradient.addColorStop(1,'rgba(129,194,235,0)');
      ctx.fillStyle=gradient;ctx.fillRect(x,y,w,h);
    };
    edge(0,0,depth,0,0,0,depth,height);edge(width,0,width-depth,0,width-depth,0,depth,height);
    edge(0,0,0,depth,0,0,width,depth);edge(0,height,0,height-depth,0,height-depth,width,depth);
    ctx.strokeStyle='#e5f7ff';ctx.lineWidth=.7+frost*.9;ctx.globalAlpha=.12+frost*.5;
    for(let side=0;side<4;side++)for(let index=0;index<14;index++){
      const seed=Math.sin((index+1)*127.1+side*311.7)*43758.5453,random=seed-Math.floor(seed);
      if(random>Math.min(1,frost*2+.12))continue;
      const along=(index+.25+random*.5)/14,reach=depth*(.2+random*.8),vertical=side<2;
      const x=vertical?(side===0?0:width):along*width,y=vertical?along*height:(side===2?0:height);
      const nx=vertical?(side===0?1:-1):0,ny=vertical?0:(side===2?1:-1);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+nx*reach,y+ny*reach);
      for(const branch of [.35,.65]){
        const bx=x+nx*reach*branch,by=y+ny*reach*branch,span=reach*(1-branch)*.46;
        ctx.moveTo(bx,by);ctx.lineTo(bx+nx*span+ny*span,by+ny*span-nx*span);
        ctx.moveTo(bx,by);ctx.lineTo(bx+nx*span-ny*span,by+ny*span+nx*span);
      }ctx.stroke();
    }
    ctx.restore();
  }
}
