import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {TILE_MATERIALS} from '../dist/tile-materials.js';
const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../.openai/tmp/material-shatter-20261105/qa/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{
  for(const material of TILE_MATERIALS){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.addInitScript(id=>{
      localStorage.setItem('wordtiles.tile-material.v1',JSON.stringify({material:id,press:'short'}));
      const Native=Worker;let first=true;
      window.Worker=class extends Native{
        constructor(url,options){super(url,options);this.generator=String(url).includes('/generator.worker.js');if(this.generator)this.addEventListener('message',({data})=>{if(data.result?.ok)window.__qaMaterialLevel=data.result.level;});}
        postMessage(data,...rest){if(this.generator&&first){first=false;data={...data,seed:42,levelConfig:{rows:3,cols:3,wordLengths:[3,3,3,4,5],maxUses:3}};}return super.postMessage(data,...rest);}
      };
    },material.id);
    // Pause only the real shatter controller's clock for reproducible visual frames.
    await page.route('**/board-shatter.js?*',async route=>{
      let source=await readFile(new URL('../dist/board-shatter.js',import.meta.url),'utf8');
      source=source.replace('requestFrame=fn=>globalThis.requestAnimationFrame(fn)','requestFrame=()=>0');
      source=source.replace('this.session=null;this.counts=[];this.active=new Set();','this.session=null;this.counts=[];this.active=new Set();window.__qaShatter=this;');
      await route.fulfill({contentType:'text/javascript',body:source});
    });
    await page.goto(process.env.WORDTILES_URL||'http://127.0.0.1:4173/?theme=alps');await page.waitForFunction(()=>!document.getElementById('start-game').disabled);
    await page.locator('#start-game').click();await page.waitForFunction(()=>!document.getElementById('hint').disabled&&!document.querySelector('.play-panel').classList.contains('level-entering'));
    const expectedBridge=material.id==='original'?'/connectors/purple.png':material.id+'/pressed-short.png';
    for(const [direction,chain]of [['vertical',[0,3,6]],['turn',[0,1,4]]]){
      for(const cell of chain)await page.locator(`.tile[data-cell="${cell}"]`).press('Space');
      const links=await page.locator('.selection-bridge').evaluateAll(nodes=>nodes.map(node=>({from:Number(node.dataset.from),to:Number(node.dataset.to),image:getComputedStyle(node).backgroundImage,events:getComputedStyle(node).pointerEvents})));
      assert.equal(links.length,2,JSON.stringify({direction,selected:await page.locator('.tile.selected').count(),readout:await page.locator('#current-word').textContent()}));assert.deepEqual(links.map(link=>[link.from,link.to]),[[chain[0],chain[1]],[chain[1],chain[2]]]);
      assert.ok(links.every(link=>link.image.includes(expectedBridge)&&link.events==='none'));
      const below=await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.selection-bridges')).zIndex)<Number(getComputedStyle(document.querySelector('#board .tile')).zIndex));assert.equal(below,true);
      assert.equal(await page.locator('.connections polyline').count(),0);
      await page.waitForTimeout(140);
      await page.screenshot({path:out+material.id+'-links-'+direction+'.png'});
      await page.locator(`.tile[data-cell="${chain.at(-1)}"]`).press('Escape');assert.equal(await page.locator('.selection-bridge').count(),0);
    }
    const counts=await page.locator('#board .tile').evaluateAll(tiles=>tiles.map(tile=>Number(tile.dataset.remaining)));
    const level=await page.evaluate(()=>window.__qaMaterialLevel);
    const target=level.targets.find(target=>(target.canonicalPath||target.path).some(cell=>counts[cell]===1));assert.ok(target);
    const path=target.canonicalPath||target.path;assert.ok(path.length>=3);
    const point=async cell=>{const r=await page.locator(`.tile[data-cell="${cell}"]`).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
    const move=async cell=>{const p=await point(cell);await page.mouse.move(p.x,p.y,{steps:4});};
    await move(path[0]);await page.mouse.down();await move(path[1]);await move(path[2]);
    await page.waitForTimeout(140);
    const held=await page.locator('#board .tile.selected').evaluateAll(tiles=>tiles.map(tile=>{const frame=getComputedStyle(tile,'::before');return {cell:Number(tile.dataset.cell),image:getComputedStyle(tile).backgroundImage,frameColor:frame.borderTopColor,frameWidth:parseFloat(frame.borderTopWidth),frameEvents:frame.pointerEvents,frameOpacity:Number(frame.opacity)};}));
    assert.equal(held.length,3);assert.deepEqual(held.map(tile=>tile.cell).sort(),path.slice(0,3).sort());
    assert.ok(held.every(tile=>tile.image.includes(material.id==='original'?'dancikuai_1@2x.png':material.id+'/pressed-short.png')));
    assert.ok(held.every(tile=>tile.frameColor==='rgba(255, 255, 255, 0.95)'&&tile.frameWidth>=1&&tile.frameEvents==='none'&&tile.frameOpacity>.99));
    assert.equal(await page.locator('.selection-bridge').count(),2);
    assert.ok((await page.locator('.selection-bridge').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundImage))).every(image=>image.includes(expectedBridge)));
    await page.screenshot({path:out+material.id+'-path-held.png'});
    await move(path[1]);assert.equal(await page.locator('#board .tile.selected').count(),2);
    assert.equal(await page.locator('.selection-bridge').count(),1);
    assert.equal(await page.locator(`.tile[data-cell="${path[2]}"]`).evaluate(tile=>getComputedStyle(tile,'::before').borderTopWidth),'0px');
    assert.ok((await page.locator(`.tile[data-cell="${path[2]}"]`).evaluate(tile=>getComputedStyle(tile).backgroundImage)).includes(material.id==='original'?'dancikuai_2@2x.png':material.id+'/highlight.png'));
    for(const cell of path.slice(2))await move(cell);await page.mouse.up();
    assert.equal(await page.locator('#board .tile.selected').count(),0);
    assert.equal(await page.locator('.selection-bridge').count(),0);
    await page.waitForFunction(()=>window.__qaShatter.active.size>0);
    const inspection=await page.evaluate(()=>{
      const shatter=window.__qaShatter;
      for(const record of shatter.active){clearTimeout(record.timer);record.timer=null;shatter.draw(record,record.startedAt+220);}
      const shards=[...document.querySelectorAll('.tile-shard')],batches=[...shatter.active];
      return {particles:shards.length,material:document.querySelector('.board-shatter-layer').dataset.material,
        cells:[...new Set(shards.map(shard=>Number(shard.dataset.shardCell)))],
        text:shards.map(shard=>shard.textContent).join(''),children:shards.some(shard=>shard.children.length>0),
        copiedLetters:document.querySelectorAll('.board-shatter-layer .tile-letter,.board-shatter-layer .count-badge,.tile-shatter-dust').length,
        faces:[...new Set(shards.map(shard=>shard.style.backgroundImage))],round:shards[0].style.borderRadius,
        drag:batches[0].particles[0].drag,gravity:batches[0].particles[0].gravity};
    });
    assert.equal(inspection.material,material.id);assert.ok(inspection.particles>0);assert.equal(inspection.text,'');assert.equal(inspection.children,false);assert.equal(inspection.copiedLetters,0);
    assert.deepEqual(inspection.cells.sort(),path.filter(cell=>counts[cell]===1).sort());
    const actualFaces=material.id==='original'?['dancikuai_1@2x.png','dancikuai_2@2x.png']:[material.id+'/highlight.png',material.id+'/pressed-short.png'];
    assert.ok(inspection.faces.every(face=>actualFaces.some(file=>face.includes(file))),JSON.stringify(inspection));
    await page.screenshot({path:out+material.id+'-shatter-220.png'});
    await page.evaluate(()=>{for(const record of window.__qaShatter.active)window.__qaShatter.draw(record,record.startedAt+650);});
    await page.screenshot({path:out+material.id+'-shatter-650.png'});
    await page.locator('#back-lobby').click();assert.equal(await page.locator('.board-shatter-layer').count(),0);
    assert.deepEqual(errors,[]);results.push({material:material.id,word:target.word,held:held.length,...inspection});await context.close();
    console.log('PASS '+material.label+'：横/竖/拐弯连接条配套且在方块下层，白框/回退/清理、无字碎片正常');
  }
  assert.ok(new Set(results.map(result=>result.particles)).size>=5);await writeFile(out+'results.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
