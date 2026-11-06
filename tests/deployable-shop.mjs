// Isolated garage presentation and purchase fixtures. No game loop or browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'panda-deployable-shop-'));
const previousDocument=globalThis.document;
try {
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"commonjs"}');
  for(const file of fs.readdirSync('src').filter(file=>file.endsWith('.ts'))){
    const {outputText}=ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
    fs.writeFileSync(path.join(temporary,file.replace(/\.ts$/,'.js')),outputText);
  }
  class Node {
    constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];this.className='';this.attributes={};this.style={setProperty(){}};this.dataset={};this._text='';}
    append(...children){this.children.push(...children);}
    replaceChildren(){this.children=[];this._text='';}
    setAttribute(key,value){this.attributes[key]=value;}
    set textContent(value){this._text=value;this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
    querySelector(){return null;}
  }
  globalThis.document={createElement:tag=>new Node(tag),activeElement:null};
  const require=createRequire(path.join(temporary,'package.json'));
  const {Interface}=require('./interface.js'),{Economy}=require('./economy.js'),{freshSave}=require('./saves.js');
  const {upgradeDefinitions}=require('./upgrade-definitions.js'),{deployables}=require('./deployables.js');
  const {itemArtUrls}=require('./item-art.js');
  const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),measureText:text=>({width:text.length*7})},{get:(target,key)=>key in target?target[key]:(()=>{})});
  const accessible=new Node(),data=freshSave('Deployable shop');data.moneyCents=2000000;data.scrap=data.scrapCollected=200;
  const economy=new Economy(data,()=>{});let dispatched='';
  const ui=new Interface(ctx,accessible,action=>{dispatched=action;const [verb,key,level]=action.split(':');if(verb==='select')ui.selected=key;if(verb==='buy')economy.purchase(key,Number(level));});
  ui.category='DEPLOYABLES';ui.selected='boosters';
  const render=()=>ui.garage(1440,900,economy,true);
  render();
  const cards=ui.buttons.filter(button=>button.deployable);
  assert.equal(cards.length,6);assert.deepEqual(cards.map(card=>card.action),deployables.map(item=>`select:${item.item}`));
  assert.ok(cards.every(card=>card.width===card.height&&card.x>=48&&card.x+card.width<=420&&card.y>=171&&card.y+card.height<501),'six square cards fit their garage column');
  assert.ok(cards.some(card=>card.deployable.art==='booster')&&cards.some(card=>card.deployable.art==='teleporter'));
  const allNodes=node=>[node,...node.children.flatMap(allNodes)];
  const nativeCards=allNodes(accessible).filter(node=>node.className.includes('deployable-tile'));
  assert.equal(nativeCards.length,6,'native/mobile garage exposes the same six cards');
  assert.equal(nativeCards.filter(node=>node.attributes['aria-pressed']==='true').length,1);
  const children=accessible.children,gridIndex=children.findIndex(node=>node.className==='deployable-grid'),detailsIndex=children.findIndex(node=>node.className.includes('deployable-details')),buyIndex=children.findIndex(node=>node.className.includes('action-buy'));
  assert.equal(children[0].tagName,'H1','Deployables starts with a short garage heading');
  assert.ok(gridIndex>0&&detailsIndex>gridIndex&&buyIndex>detailsIndex,'mobile presents its cards before selected-item details and Buy One');
  assert.ok(children.every((node,index)=>!node.className.includes('action-category')||index<gridIndex),'category choices stay before the cards');
  assert.ok(children[detailsIndex].textContent.includes(upgradeDefinitions.boosters.description),'selected item details remain accessible below the cards');
  assert.ok(allNodes(accessible).some(node=>node.tagName==='IMG'&&node.src===itemArtUrls.booster));
  assert.ok(allNodes(accessible).some(node=>node.tagName==='IMG'&&node.src===itemArtUrls.teleporter));
  assert.ok(!/inventory|debris/i.test(accessible.textContent),'public garage copy uses Deployables and scrap');
  const teleporter=cards.find(card=>card.action==='select:teleporter');
  ui.activate(ui.offsetX+(teleporter.x+teleporter.width/2)*ui.scale,ui.offsetY+(teleporter.y+teleporter.height/2)*ui.scale);
  assert.equal(dispatched,'select:teleporter');render();
  const price=economy.cost('teleporter',1),beforeMoney=data.moneyCents,beforeScrap=data.scrap;
  const nativeBuy=allNodes(accessible).find(node=>node.className.includes('action-buy'));
  nativeBuy.onclick();assert.equal(dispatched,'buy:teleporter:1');assert.equal(data.inventory.teleporter,1);
  assert.equal(data.moneyCents,beforeMoney-price.moneyCents);assert.equal(data.scrap,beforeScrap-price.scrap);
  render();assert.equal(ui.buttons.find(button=>button.action==='select:teleporter').deployable.stock,1,'unused stock appears on its tile');
  for(const deployment of deployables){
    assert.equal(upgradeDefinitions[deployment.item].category,'DEPLOYABLES');
    assert.match(upgradeDefinitions[deployment.item].description,new RegExp(`Press ${deployment.key}`),'item descriptions match the numeric activation key');
  }
  console.log('Deployable shop checks passed: six square cards, supplied art, native/mobile selection, exact single-item purchases, persistent stock, scrap wording, and matching 1–6 shortcuts. No game session started.');
} finally {globalThis.document=previousDocument;fs.rmSync(temporary,{recursive:true,force:true});}
