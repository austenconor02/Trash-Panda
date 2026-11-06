// Supplied item art and orbital scrap presentation only. Never starts a game.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'panda-item-art-'));
const previous={Image:globalThis.Image,document:globalThis.document};
try{
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"commonjs"}');
  for(const file of ['config','item-art','world-visuals']){
    const {outputText}=ts.transpileModule(fs.readFileSync(`src/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
    fs.writeFileSync(path.join(temporary,`${file}.js`),outputText);
  }
  const expectedHashes = {"deployable-booster.png":"d8e9fe50f2a725e3c93a392c96711e643e9589b65d8d8c6327c5b04813421982","deployable-teleporter.png":"47005372036f2176a48284e64455ea8a3e257af1d7a85093f6a40c2498c9df1b","orbital-scrap.png":"7ae6585af1f2bd9641412506b64139af7bdcfe925c8258550b8b7f11330c7bbd","orbital-scrap-alt.png":"7d26b2e20c83724312b85e11b4ba78e655521af1fdf9da5bcffd284662f45054"};
  for(const [name,expected]of Object.entries(expectedHashes)){
    const png=fs.readFileSync(`public/assets/${name}`);
    assert.equal(crypto.hash('sha256',png),expected,'supplied artwork is copied without editing pixels or alpha');
    assert.ok(png.readUInt32BE(16)>0&&png.readUInt32BE(20)>0);
    assert.equal(png[25],6,'supplied PNG preserves RGBA transparency');
  }
  let readbacks=0;
  const pixels=new Uint8ClampedArray(16*14*4);
  for(let y=5;y<=10;y++)for(let x=4;x<=10;x++)pixels[(y*16+x)*4+3]=255;
  globalThis.Image=class{naturalWidth=16;naturalHeight=14;set src(url){this.url=url;queueMicrotask(()=>this.onload?.());}};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData(){readbacks++;return{data:pixels};}})})};
  const require=createRequire(path.join(temporary,'package.json'));
  const {itemArt,itemArtUrls,ItemArtwork}=require('./item-art.js');
  await itemArt.ready;assert.equal(readbacks,4,'each source is measured once');
  const operations=[],states=[];
  const ctx={globalAlpha:.8,save(){states.push(this.globalAlpha);},restore(){this.globalAlpha=states.pop();},translate(...args){operations.push(['translate',...args]);},rotate(...args){operations.push(['rotate',...args]);},drawImage(...args){operations.push(['image',this.globalAlpha,...args]);}};
  assert.equal(itemArt.draw(ctx,'booster',100,50,40,20,.5,.4),true);
  const draw=operations.find(op=>op[0]==='image');
  assert.deepEqual(draw.slice(3,7),[2,3,11,10],'trim has a small alpha fringe margin');
  assert.deepEqual(draw.slice(7),[-11,-10,22,20],'the trimmed original is contain-fit with its aspect ratio intact');
  assert.deepEqual(operations[0],['translate',120,60]);assert.deepEqual(operations[1],['rotate',.5]);
  assert.ok(Math.abs(draw[1]-.32)<1e-9);assert.equal(ctx.globalAlpha,.8,'draw restores the caller alpha');
  for(let i=0;i<100;i++)itemArt.draw(ctx,'teleporter',0,0,30,30);
  assert.equal(readbacks,4,'drawing does not repeat alpha readback');
  assert.equal(itemArt.draw(ctx,'scrap',0,0,0,30),false);
  assert.equal(itemArt.draw(ctx,'missing',0,0,30,30),false);
  assert.deepEqual(Object.keys(itemArtUrls).sort(),['booster','scrap','scrapAlt','teleporter']);

  const {scrapOrbitPose,drawSpinningCoin}=require('./world-visuals.js');
  const variants=new Set(),rotations=new Set();
  for(let i=0;i<30;i++){
    const coin={id:`scrap-${i}`,x:150,y:15000,tier:'scrap',scrapValue:i%3===0?5:1},original=structuredClone(coin);
    const frozen=scrapOrbitPose(coin,4.25);assert.deepEqual(scrapOrbitPose(coin,4.25),frozen,'paused presentation stays perfectly still');
    variants.add(frozen.variant);rotations.add(frozen.rotation.toFixed(2));
    const xs=[];
    for(let frame=0;frame<1200;frame++){
      const pose=scrapOrbitPose(coin,frame/60);xs.push(pose.x);
      assert.ok(Math.abs(pose.x)<6&&Math.abs(pose.y)<3,'scrap stays close to its pickup anchor');
      if(frame){const before=scrapOrbitPose(coin,(frame-1)/60);assert.ok(Math.hypot(pose.x-before.x,pose.y-before.y)<.1,'orbital movement is continuous');}
    }
    assert.ok(Math.min(...xs)<0&&Math.max(...xs)>0,'each piece floats left and right');
    assert.deepEqual(coin,original,'orbital drawing never changes pickup positions or rewards');
    coin.magnet={fromX:150,fromY:15000,targetX:200,targetY:15000,age:.2,duration:.34};
    const arrival=scrapOrbitPose(coin,4.25);assert.equal(arrival.x,0);assert.equal(arrival.y,0,'magnet arrivals remove drift before collection');
  }
  assert.equal(variants.size,2,'both supplied scrap shapes appear');assert.ok(rotations.size>20,'pieces have independently varied angles');
  const coin={id:'drawing-scrap',x:80,y:15000,tier:'scrap',scrapValue:2};operations.length=0;
  drawSpinningCoin(ctx,coin,80,100,2,false);
  assert.deepEqual(operations[0],['translate',80,100],'collected glints cannot regain orbital drift');

  delete globalThis.Image;
  const unavailable=new ItemArtwork();await unavailable.ready;assert.equal(unavailable.draw(ctx,'booster',0,0,20,20),false,'headless code checks need no image support');
  console.log('Item artwork checks passed: original RGBA assets, contain-fit alpha trims, shared cache, two scrap variants, smooth bounded orbit angles, and centered magnet/collection arrivals. No game started.');
}finally{
  for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  fs.rmSync(temporary,{recursive:true,force:true});
}
