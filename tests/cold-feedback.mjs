// Pure cold model and recorded drawing commands; no game or browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';import ts from 'typescript';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'panda-cold-'));
try{
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"commonjs"}');
  for(const file of ['config','temperature','cold-effects']){
    const {outputText}=ts.transpileModule(fs.readFileSync(`src/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
    fs.writeFileSync(path.join(temporary,`${file}.js`),outputText);
  }
  const require=createRequire(path.join(temporary,'package.json'));
  const {coldFeedback,ColdOverlay}=require('./cold-effects.js'),{temperatureDamage}=require('./temperature.js');
  for(const planet of ['earth','moon'])for(const feet of [0,5000,15000,65000,200000,800000]){
    let last=Infinity;
    for(let suit=0;suit<=5;suit++){
      const state=coldFeedback(feet,suit,25,planet);
      assert.equal(state.damageRate,temperatureDamage(feet,suit,planet),'frost uses actual suit-adjusted cold exposure');
      assert.ok(state.frost<=last,'better suits never create more frost at the same altitude');last=state.frost;
      assert.ok(state.frost>=0&&state.frost<=1&&state.barIce>=0&&state.barIce<=1);
    }
  }
  assert.equal(coldFeedback(1000,0,1).frost,0,'warm air does not freeze a low-health player');
  assert.equal(coldFeedback(65000,3,1).frost,0,'a protective suit prevents frost even when health is low');
  assert.ok(coldFeedback(15000,0,100).frost>0&&coldFeedback(15000,0,100).frost<.1,'early frost starts subtly');
  const health=[100,75,50,35,10,1].map(h=>coldFeedback(200000,0,h));
  assert.ok(health.every((s,i)=>i===0||s.frost>health[i-1].frost),'icy borders intensify as health depletes');
  assert.equal(health[2].danger,0);assert.ok(health[3].danger>0&&health[5].barIce>health[3].barIce,'red pulse and icy bar edges scale below half health');
  for(const [width,height]of [[320,568],[390,844],[1440,900]]){
    const fills=[];let strokes=0;
    const ctx={save(){},restore(){},createLinearGradient(){return{addColorStop(){}};},fillRect(x,y,w,h){fills.push({x,y,w,h});},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
    const overlay=new ColdOverlay();overlay.draw(ctx,width,height,health[5],1,true);
    assert.equal(fills.length,4);assert.ok(strokes>0,'dangerous cold grows visible edge crystals');
    assert.ok(fills.every(r=>!(width/2>r.x&&width/2<r.x+r.w&&height/2>r.y&&height/2<r.y+r.h)),'frost leaves the center of the screen clear');
    fills.length=0;overlay.draw(ctx,width,height,coldFeedback(1000,5,100),2,true);assert.equal(fills.length,0,'protection/warmth clears frost');
  }
  console.log('Cold feedback checks passed: actual suit protection, subtle onset, health-scaled frost, clear center, and recovery. No game started.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
