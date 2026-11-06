// Static fixtures and Canvas recording only: no Game, input, animation loop, or audio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'panda-hud-'));
try{
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"commonjs"}');
  for(const file of fs.readdirSync('src').filter(file=>file.endsWith('.ts'))){
    const {outputText}=ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
    fs.writeFileSync(path.join(temporary,file.replace(/\.ts$/,'.js')),outputText);
  }
  const require=createRequire(path.join(temporary,'package.json'));
  const {FlightHud}=require('./flight-hud.js'),{hudLayout,basicRadarDetects}=require('./hud-layout.js');
  const {freshSave}=require('./saves.js'),{Scoring}=require('./scoring.js');
  const dimensions={desktop:[1672,941],mobile:[941,1672]};
  const artworkHashes={"desktop":"71db1df5081bb48eb48e956851d5fdb4f479b0a11c9834569ea696f0ecc1a953","mobile":"b3d8ffa7f13a2651eace8aec386cb59a5a9e70146a86af34a96b242d9d9c7a89"};
  for(const source of ['desktop','mobile']){
    const bytes=fs.readFileSync(`public/assets/hud-${source}.png`);
    assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],dimensions[source]);
    assert.equal(crypto.hash('sha256',bytes),artworkHashes[source],'the supplied artwork stays unchanged');
  }
  const contained=(outer,inner)=>inner.x>=outer.x-.001&&inner.y>=outer.y-.001&&inner.x+inner.width<=outer.x+outer.width+.001&&inner.y+inner.height<=outer.y+outer.height+.001;
  for(const [width,height] of [[320,568],[390,844],[568,320],[740,500],[900,400],[1024,768],[1440,900],[1920,1080]]){
    const layout=hudLayout(width,height),viewport={x:0,y:0,width,height};
    for(const frame of [layout.left,layout.right,...layout.items]){
      assert.ok(contained(viewport,frame.rect),`${width}x${height}: hardware stays on screen`);
      const [w,h]=dimensions[frame.source];assert.ok(contained({x:0,y:0,width:w,height:h},frame.crop),'atlas crops stay within the original image');
    }
    for(const key of ['altitude','distance','fuel','oxygen','health','money'])assert.ok(contained(layout.left.rect,layout[key]),`${key} stays inside its housing`);
    for(const key of ['gravity','temperature'])assert.ok(contained(layout.right.rect,layout[key]));
    const r=layout.radar;assert.ok(contained(layout.right.rect,{x:r.x-r.radius,y:r.y-r.radius,width:r.radius*2,height:r.radius*2}));
    assert.equal(layout.items.length,6);assert.ok(layout.controlsBottom>0&&layout.controlsBottom<height-50);
  }
  const makeContext=()=>{
    const operations=[],states=[];
    const ctx={font:'10px monospace',fillStyle:'',strokeStyle:'',globalAlpha:1,textAlign:'left',textBaseline:'middle',
      save(){states.push({font:this.font,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,globalAlpha:this.globalAlpha,textAlign:this.textAlign,textBaseline:this.textBaseline});},restore(){Object.assign(this,states.pop());},
      beginPath(){},rect(){},arc(){},clip(){},moveTo(){},lineTo(){},stroke(){},fill(){},
      fillRect(x,y,width,height){operations.push({kind:'rect',x,y,width,height,color:this.fillStyle,alpha:this.globalAlpha});},
      strokeRect(x,y,width,height){operations.push({kind:'outline',x,y,width,height,color:this.strokeStyle,blur:this.shadowBlur??0});},
      translate(x,y){operations.push({kind:'shift',x,y});},
      fillText(text,x,y,maxWidth){operations.push({kind:'text',text,x,y,maxWidth,size:parseFloat(this.font)});},
      measureText(text){return{width:text.length*parseFloat(this.font)*.61};},drawImage(){},
    };return{ctx,operations};
  };
  const data=freshSave('HUD fixture');data.moneyCents=987654321;data.levels.jetpack=1;data.levels.suit=5;
  const player={x:0,y:20211.2},score=new Scoring();score.maxAltitude=101056;score.distance=98765;score.duration=62.4;score.coinCents=875;score.platformCents=600;
  Object.assign(data.inventory,{boosters:3,leadBoots:1,teleporter:1,health20:2,health50:1});
  const equipment={fuel:2.4,capacity:48.6,oxygen:372,oxygenCapacity:480,health:63,fuelDraining:true,oxygenDraining:true,healthDraining:false,boosters:3,boots:1,teleports:1,healthPacks:{health20:2,health50:1,health75:0}};
  const platforms=Array.from({length:20},(_,i)=>({id:`radar-${i}`,x:(i-10)*30,y:player.y+(i-10)*30,width:150,tier:['silver','gold','red','purple'][i%4],used:false}));
  const render=(width,height,level)=>{data.levels.radar=level;const recording=makeContext();const hud=new FlightHud();hud.draw(recording.ctx,width,height,player,score,equipment,data,{platforms},1,1,true);return{...recording,hud};};
  for(const [width,height] of [[320,568],[390,844],[568,320],[1440,900]]){
    const {operations}=render(width,height,0),texts=operations.filter(op=>op.kind==='text');
    for(const label of ['ALTITUDE','DISTANCE','FUEL','OXYGEN','HEALTH','CASH COLLECTED',hudLayout(width,height).compact?'G':'GRAVITY','TEMP','RADAR','OFFLINE'])assert.ok(texts.some(op=>op.text===label),`${label} is present`);
    assert.ok(!texts.some(op=>op.text.includes('BANK')||op.text.includes('9,876,543.21')),'bank balance is never shown');
    assert.ok(texts.some(op=>op.text==='$14.75'),'HUD cash is collected coins plus platform cash only');
    assert.ok(texts.some(op=>op.text==='101,056 ft')&&texts.some(op=>op.text==='372/480 S')&&texts.some(op=>op.text==='63/100'));
    assert.ok(texts.every(op=>op.x>=0&&op.x<=width&&op.y>=0&&op.y<=height&&op.maxWidth>0),'readouts receive finite on-screen bounds');
  }
  const collected=score.collectedCents,paydayBefore=score.breakdown().totalCents;
  score.maxAltitude=800000;score.distance=1600000;score.duration=999;score.spaceDuration=888;
  assert.equal(score.collectedCents,collected,'height, distance, time, and payday multipliers never enter HUD cash');
  assert.notEqual(score.breakdown().totalCents,paydayBefore,'payday remains a separate calculation');
  score.finalize(true,0);assert.equal(score.collectedCents,1475,'recovery deductions do not rewrite collected cash');
  assert.ok(render(1440,900,0).operations.some(op=>op.kind==='text'&&op.text==='$14.75'));
  score.coinCents+=25;assert.equal(score.collectedCents,1500,'coin pickups update collected cash');score.platformCents+=100;assert.equal(score.collectedCents,1600,'platforms update collected cash');
  for(const level of [0,1,2,3]){
    const {operations}=render(1440,900,level),marks=operations.filter(op=>op.kind==='rect'&&op.height===3);
    const expected=level===0?0:level===1?platforms.filter(p=>basicRadarDetects(p.id)).length:platforms.length;
    assert.equal(marks.length,expected,'radar remains offline until purchased and preserves all three coverage tiers');
    if(level===3)assert.ok(new Set(marks.map(mark=>mark.color)).size===4,'the final radar tier shows platform colors');
  }
  const {ctx,operations,hud}=render(1440,900,0),slot=hudLayout(1440,900).health;
  for(const value of [-50,0,10,100,1000]){
    operations.length=0;equipment.health=value;
    hud.draw(ctx,1440,900,player,score,equipment,data,{platforms},2,1,true);
    const fills=operations.filter(op=>op.kind==='rect'&&Math.abs(op.y-slot.y)<.001&&op.color!=='#06160ec9'&&Math.abs(op.height-slot.height)<.001);
    assert.ok(fills.every(op=>op.width>=0&&op.width<=slot.width),'resource animation cannot overflow its slot');
  }
  operations.length=0;equipment.health=35;equipment.healthDraining=true;
  hud.draw(ctx,1440,900,player,score,equipment,data,{platforms},2.2,1,false);
  assert.ok(operations.some(op=>op.kind==='shift'&&(Math.abs(op.x)>0||Math.abs(op.y)>0)),'damaged health vibrates within its clipped screen');
  assert.ok(operations.some(op=>op.kind==='outline'&&op.color==='#ff776c'&&op.blur>0),'health below half pulses and glows red');
  operations.length=0;hud.draw(ctx,1440,900,player,score,equipment,data,{platforms},2.3,1,true);
  assert.ok(!operations.some(op=>op.kind==='shift'),'reduced motion keeps health warning steady');
  console.log('HUD checks passed: original artwork, modular desktop/mobile bounds, fitted live values, no bank balance, clamped resources, offline radar and purchased detection tiers. No game session started.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
