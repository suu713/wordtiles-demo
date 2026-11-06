import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {TILE_MATERIALS,TILE_MATERIAL_KEY} from '../dist/tile-materials.js';

const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fileURLToPath(new URL('../.openai/tmp/tile-materials-20261105/',import.meta.url));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],missing=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
const pass=name=>{checks.push(name);console.log('PASS '+name);};
// Test-only startup fixture; no production seed or gameplay changes.
await context.addInitScript(()=>{
  const Native=Worker;let first=true;
  window.Worker=class extends Native{
    constructor(url,options){super(url,options);this.generator=String(url).includes('/generator.worker.js');if(this.generator)this.addEventListener('message',({data})=>{if(data.result?.ok)window.__qaMaterialLevel=data.result.level;});}
    postMessage(data,...rest){if(this.generator&&first){first=false;data={...data,seed:42,levelConfig:{rows:3,cols:3,wordLengths:[3,3,3,4,5],maxUses:3}};}return super.postMessage(data,...rest);}
  };
});
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?theme=alps';
const ready=p=>p.waitForFunction(()=>!document.getElementById('start-game').disabled);
const settings=async p=>{if(await p.locator('#back-lobby').isVisible())await p.locator('#back-lobby').click();await p.locator('#lobby-settings').click();};
const choose=async(p,id)=>{await p.locator('#tile-material-select').selectOption(id);await p.waitForFunction(id=>document.documentElement.dataset.tileMaterial===id&&document.getElementById('tile-material-status').textContent==='',id);};
const play=async p=>{await p.locator('#settings-close').click();await p.locator('#start-game').click();await p.waitForFunction(()=>!document.querySelector('.play-panel').classList.contains('level-entering'));};
const boardState=p=>p.evaluate(()=>({cells:[...document.querySelectorAll('#board .tile')].map(tile=>({cell:tile.dataset.cell,text:tile.textContent,empty:tile.classList.contains('empty')})),targets:[...document.querySelectorAll('#targets .target')].map(target=>({word:target.dataset.word,done:target.classList.contains('completed')})),collection:document.getElementById('dictionary-count').textContent}));
try{
  const manifest=JSON.parse(await readFile(new URL('../dist/art/tile-materials/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.assets.length,24);
  for(const asset of manifest.assets){const data=await readFile(new URL('../dist/art/tile-materials/'+asset.file,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);assert.deepEqual(asset.size,[154,156]);}
  pass('24张原始材质切图完整，尺寸和SHA-256匹配');
  const connector=JSON.parse(await readFile(new URL('../dist/art/tile-materials/connectors/manifest.json',import.meta.url),'utf8'));
  const connectorData=await readFile(new URL('../dist/art/tile-materials/connectors/'+connector.file,import.meta.url));assert.equal(createHash('sha256').update(connectorData).digest('hex'),connector.sha256);assert.deepEqual(connector.size,[26,46]);
  await page.goto(url);await ready(page);await settings(page);
  assert.equal(await page.locator('#tile-material-select option').count(),7);assert.equal(await page.locator('#tile-press-select').isDisabled(),true);
  let baseline;
  for(const material of TILE_MATERIALS){
    await choose(page,material.id);await play(page);
    const state=await boardState(page);if(!baseline)baseline=state;assert.deepEqual(state,baseline);
    const tile=page.locator('#board .tile:not(.empty)').first();
    const source=material.id==='original'?'dancikuai_2@2x.png':material.id+'/highlight.png';
    assert.ok((await tile.evaluate(el=>getComputedStyle(el).backgroundImage)).includes(source));
    const target=page.locator('#targets .target-letter').first();assert.ok((await target.evaluate(el=>getComputedStyle(el).backgroundImage)).includes(source));
    await tile.press('Space');
    assert.ok((await tile.evaluate(el=>getComputedStyle(el).backgroundImage)).includes(material.id==='original'?'dancikuai_1@2x.png':material.id+'/pressed-short.png'));
    await page.screenshot({path:output+material.id+'-selected.png'});await tile.press('Escape');
    await page.screenshot({path:output+material.id+'-game.png'});
    if(material.id!=='original'){
      const bounds=await tile.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
      assert.ok((await tile.evaluate(el=>getComputedStyle(el).backgroundImage)).includes(material.id+'/pressed-short.png'));
      await page.screenshot({path:output+material.id+'-pressed.png'});await page.mouse.up();await tile.press('Escape');
    }
    await settings(page);
  }
  pass('原版和六款材质立即切换，普通/选中/按压、目标词均使用对应切图；字母、次数、进度和收藏不变');
  await choose(page,'ice');await page.locator('#tile-press-select').selectOption('pressed');
  await page.waitForFunction(()=>document.documentElement.dataset.tilePress==='pressed'&&document.getElementById('tile-material-status').textContent==='');
  await page.screenshot({path:output+'settings-390.png'});await play(page);
  const tile=page.locator('#board .tile:not(.empty)').first(),bounds=await tile.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();assert.ok((await tile.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('ice/pressed.png'));await page.mouse.up();await tile.press('Escape');
  const level=await page.evaluate(()=>window.__qaMaterialLevel),target=level.targets[0],path=target.canonicalPath||target.path;
  for(const cell of path)await page.locator(`.tile[data-cell="${cell}"]`).press('Space');await page.locator(`.tile[data-cell="${path.at(-1)}"]`).press('Enter');
  await page.waitForFunction(word=>[...document.querySelectorAll('.target.completed')].some(target=>target.dataset.word===word),target.word);
  assert.ok((await page.locator('.target.completed .target-letter').first().evaluate(el=>getComputedStyle(el).backgroundImage)).includes('ice/normal.png'));
  const progressed=await boardState(page);await settings(page);await choose(page,'wood');await play(page);assert.deepEqual(await boardState(page),progressed);
  for(const empty of await page.locator('#board .tile.empty').all())assert.equal(await empty.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  await page.screenshot({path:output+'wood-progress.png'});
  pass('两种按压样式可比较；实际收词成功、剩余次数和空格正确，切换材质保留已完成目标');
  await settings(page);
  for(let i=0;i<8;i++)await page.locator('#tile-material-next').click();
  await page.waitForFunction(()=>document.getElementById('tile-material-status').textContent==='');
  assert.equal(await page.locator('#tile-material-select').inputValue(),'original');
  await choose(page,'jelly');await page.reload();await ready(page);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.tileMaterial),'jelly');
  const other=await context.newPage();await other.goto(url);await ready(other);
  assert.equal(await other.evaluate(()=>document.documentElement.dataset.tileMaterial),'jelly');
  await settings(page);await choose(page,'sand');await other.waitForFunction(()=>document.documentElement.dataset.tileMaterial==='sand');await other.close();
  pass('一键循环含原版、连续点击落在最后选择，刷新记忆且跨标签同步');
  for(const [width,height]of [[320,568],[390,844],[844,390]]){
    await page.setViewportSize({width,height});await page.locator('#settings-close').click();await settings(page);
    assert.equal(await page.locator('#tile-material-next').isVisible(),true);
    assert.equal(await page.locator('#tile-material-select').isVisible(),true);
    const fits=await page.locator('#settings-popover').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth;});assert.equal(fits,true);
    await page.screenshot({path:output+`settings-${width}x${height}.png`});
  }
  await page.locator('#clear-all-data').scrollIntoViewIfNeeded();
  await Promise.all([page.waitForNavigation(),page.locator('#clear-all-data').click()]);await ready(page);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),TILE_MATERIAL_KEY),null);assert.equal(await page.evaluate(()=>document.documentElement.dataset.tileMaterial),'original');
  pass('手机与横屏设置完整可操作；清除所有数据后恢复原版');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await writeFile(output+'results.json',JSON.stringify({checks,errors,missing,assets:24},null,2));
}catch(error){await page.screenshot({path:output+'failure.png'});throw error;}finally{await browser.close();}
