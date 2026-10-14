import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createBaseDictionary} from '../dist/core/target-policy.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {BONUS_DICTIONARY,WORD_ENTRIES} from '../dist/core/word-library.js';
import {calculateLevelStatistics} from '../dist/core/level-statistics.js';
import {findWordPaths} from '../dist/core/rules.js';

const require=createRequire(import.meta.url);
let chromium;
try {({chromium}=require('playwright'));}
catch {({chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const output=fileURLToPath(new URL('../.openai/tmp/travel-ui/qa/',import.meta.url));
await mkdir(output,{recursive:true});
const fixture=JSON.parse(await readFile(new URL('../examples/tsv/seed_20261010.json',import.meta.url),'utf8'));
const session=createAlgorithmSession(fixture,createBaseDictionary([3,3,3,4,5]),{bonusDictionary:BONUS_DICTIONARY});
const extras=calculateLevelStatistics(session.initial,BONUS_DICTIONARY).extraWords.slice(0,4);
assert.equal(extras.length,4);
const baseURL=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=16';
const cases=[],errors=[],assetErrors=[];
const pass=(name)=>{cases.push({name,passed:true});console.log('PASS '+name);};
const older=['BRA','BUT','CLAP','FOR','FORTY','LAP','PAL','PRO','RID'];
const newer=['ATE','KEN','SAT','SEE','SEEN','TEEN'];
const history=[...older.map(word=>({word,language:'english',firstFoundAt:'2026-10-12T04:00:00.000Z'})),
  ...newer.map(word=>({word,language:'english',firstFoundAt:'2026-10-14T04:00:00.000Z'}))];
const browser=await chromium.launch({headless:true,channel:'chrome'});
async function pageFor(viewport,entries=null) {
  const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  if(entries)await context.addInitScript(entries=>localStorage.setItem('wordtiles.collection.v1',JSON.stringify({version:1,entries})),entries);
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)assetErrors.push(`${response.status()} ${response.url()}`);});
  await page.clock.install({time:new Date('2026-10-14T12:00:00+08:00')});
  await page.goto(baseURL);await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
  return {context,page};
}
const counts=page=>page.locator('.tile').evaluateAll(items=>items.map(el=>Number(el.dataset.remaining)));
async function drag(page,path) {
  const points=await Promise.all(path.map(async cell=>{const r=await page.locator(`[data-cell="${cell}"]`).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};}));
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
  for(const point of points.slice(1))await page.mouse.move(point.x,point.y);
  await page.mouse.up();
}
async function fits(page,id) {
  const result=await page.locator(id).evaluate(dialog=>{
    const r=dialog.getBoundingClientRect(),stage=document.querySelector(document.querySelector('#lobby').hidden?'#game-viewport':'.lobby-panel').getBoundingClientRect();
    return {screen:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
      stage:r.left>=stage.left-1&&r.right<=stage.right+1&&r.top>=stage.top-1&&r.bottom<=stage.bottom+1,
      body:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,
      dialog:dialog.scrollWidth<=dialog.clientWidth+1&&dialog.scrollHeight<=dialog.clientHeight+1,
      width:r.width,height:r.height};
  });
  assert.equal(result.screen,true,JSON.stringify(result));assert.equal(result.stage,true,JSON.stringify(result));
  assert.equal(result.body,true,JSON.stringify(result));assert.equal(result.dialog,true,JSON.stringify(result));
  return result;
}
const stageShot=(page,name)=>page.locator('#lobby').isVisible().then(visible=>page.locator(visible?'.lobby-panel':'#game-viewport').screenshot({path:output+name+'.png'}));
try {
  const {context,page}=await pageFor({width:1366,height:768});
  await page.locator('#dictionary-button').click();assert.equal(await page.locator('#dictionary-empty').isVisible(),true);
  await page.keyboard.press('Escape');await page.locator('#dictionary-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#dictionary-button').evaluate(el=>el===document.activeElement),true);
  await page.locator('#activity-button').click();assert.equal(await page.locator('.calendar-day').count(),31);assert.equal(await page.locator('#activity-empty').isVisible(),true);
  assert.deepEqual(await page.locator('#activity-calendar-grid').evaluate(el=>[...el.children].slice(0,7).map(cell=>cell.textContent)),['','','','1','2','3','4']);
  await page.locator('#activity-close').click();pass('空词典和真实月历可打开，Escape关闭并恢复入口焦点');
  await page.locator('#start-game').click();const before=await counts(page);
  await drag(page,[0,3,6]);assert.equal(await page.locator('.invalid-word').count(),3);assert.deepEqual(await counts(page),before);
  for(const word of extras)await drag(page,findWordPaths(session.initial.board.letters,word,null,null,session.initial.board)[0]);
  await drag(page,findWordPaths(session.initial.board.letters,extras[0],null,null,session.initial.board)[0]);
  assert.deepEqual(await counts(page),before);assert.equal(await page.locator('#bonus-count').textContent(),'4');
  await page.locator('#bonus-button').click();assert.deepEqual(await page.locator('#bonus-words li').allTextContents(),extras);
  assert.equal(await page.locator('#bonus-summary').textContent(),'本关额外发现 4 个词');assert.equal(await page.locator('#bonus-saved').isVisible(),true);
  assert.equal(await page.locator('#bonus-words').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  await fits(page,'#bonus-dialog');await stageShot(page,'extra-words-desktop');await page.locator('#bonus-close').click();
  assert.deepEqual(await counts(page),before);await drag(page,fixture.targets[0].canonicalPath);
  assert.equal(await page.locator('#game-collection-count').textContent(),'5');
  await page.locator('#back-lobby').click();await page.locator('#dictionary-button').click();
  assert.deepEqual((await page.locator('.dictionary-entry').evaluateAll(items=>items.map(el=>el.dataset.word))).sort(),[...extras,fixture.targets[0].word].sort());
  await page.locator('#dictionary-close').click();await page.reload();await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
  assert.equal(await page.locator('#dictionary-count').textContent(),'5');pass('错误连词变红，四个额外词去重不扣次数，目标和额外词自动收录且刷新保留');
  await context.close();

  for(const [width,height] of [[1366,768],[1024,600],[768,650],[390,844],[360,640],[320,568]]) {
    const {context,page}=await pageFor({width,height},history);
    assert.equal(await page.locator('#dictionary-count').textContent(),'15');
    await page.locator('#dictionary-button').click();await fits(page,'#dictionary-dialog');
    const expected=history.map(entry=>entry.word).sort((a,b)=>a.localeCompare(b));
    assert.deepEqual(await page.locator('.dictionary-entry').evaluateAll(items=>items.map(el=>el.dataset.word)),expected);
    if(width===390||width===1366)await stageShot(page,'dictionary-'+(width===390?'mobile':'desktop'));
    if(width===390) {
      await page.locator('#dictionary-search').fill('bra');assert.equal(await page.locator('.dictionary-entry').count(),1);
      assert.match(await page.locator('.dictionary-entry p').textContent(),/胸/);
      await page.locator('#dictionary-search').fill('胸');assert.deepEqual(await page.locator('.dictionary-entry').evaluateAll(items=>items.map(el=>el.dataset.word)),['BRA']);
      await page.locator('#dictionary-search').fill('ZZZQQQ');assert.equal(await page.locator('#dictionary-empty').isVisible(),true);
      await page.locator('#dictionary-search').fill('');pass('词典按字母排序，英文大小写和中文释义搜索使用真实词库');
    }
    await page.locator('#dictionary-close').click();await page.locator('#activity-button').click();await fits(page,'#activity-dialog');
    assert.equal(await page.locator('#activity-summary').textContent(),'2 个收词日 · 15 个词');
    assert.deepEqual(await page.locator('.calendar-day.has-words').evaluateAll(items=>items.map(el=>el.dataset.date)),['2026-10-12','2026-10-14']);
    assert.deepEqual(await page.locator('.activity-day').evaluateAll(items=>items.map(el=>el.dataset.date)),['2026-10-14','2026-10-12']);
    if(width===390||width===1366)await stageShot(page,'calendar-'+(width===390?'mobile':'desktop'));
    if(width===390) {
      await page.locator('[data-date="2026-10-12"].calendar-day').click();assert.deepEqual(await page.locator('.activity-words span').allTextContents(),older);
      await page.locator('[data-date="2026-10-14"].calendar-day').click();assert.deepEqual(await page.locator('.activity-words span').allTextContents(),newer);
      await page.locator('[data-date="2026-10-13"].calendar-day').click();assert.equal(await page.locator('#activity-empty').isVisible(),true);
      await page.locator('#activity-show-month').click();assert.equal(await page.locator('.activity-day').count(),2);
      await page.locator('#activity-month-prev').click();assert.equal(await page.locator('#activity-month-title').textContent(),'2026 年 9 月');
      assert.equal(await page.locator('.calendar-day').count(),30);assert.equal(await page.locator('#activity-empty').isVisible(),true);
      await page.locator('#activity-month-next').click();assert.equal(await page.locator('.activity-day').count(),2);
      for(let step=0;step<3;step++)await page.locator('#activity-month-next').click();
      assert.equal(await page.locator('#activity-month-title').textContent(),'2027 年 1 月');assert.equal(await page.locator('.calendar-day').count(),31);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wordtiles.collection.v1')).entries.length),15);
      pass('真实收词日期标记、当天筛选、整月恢复、空月份与跨年导航，旧记录保持首次日期');
    }
    await page.locator('#activity-close').click();await page.locator('#start-game').click();
    await page.locator('#bonus-button').click();await fits(page,'#bonus-dialog');await page.locator('#bonus-close').click();
    if(width===390) {
      for(const word of extras)await drag(page,findWordPaths(session.initial.board.letters,word,null,null,session.initial.board)[0]);
      await page.locator('#bonus-button').click();await stageShot(page,'extra-words-mobile');await page.locator('#bonus-close').click();
    }
    pass(`${width}×${height} 三个弹窗均位于竖屏内，无页面溢出，空态和列表可用`);
    await context.close();
  }

  const many=WORD_ENTRIES.slice(0,240).map(entry=>({word:entry.word,language:'english',firstFoundAt:'2026-10-14T04:00:00.000Z'}));
  const large=await pageFor({width:360,height:640},many);
  await large.page.locator('#dictionary-button').click();assert.equal(await large.page.locator('.dictionary-entry').count(),100);
  assert.equal(await large.page.locator('.dictionary-list').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  await large.page.locator('#dictionary-more').click();assert.equal(await large.page.locator('.dictionary-entry').count(),200);await fits(large.page,'#dictionary-dialog');
  await large.page.locator('.dictionary-list').evaluate(el=>el.scrollTop=el.scrollHeight);
  assert.equal(await large.page.locator('#dictionary-close').isVisible(),true);
  await large.page.locator('#dictionary-close').click();await large.page.locator('#activity-button').click();await fits(large.page,'#activity-dialog');
  assert.equal(await large.page.locator('.activity-history').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  assert.equal(await large.page.locator('.activity-words span').count(),240);
  pass('240条真实词条通过列表内部滚动和分页显示，月历及关闭按钮保持可见');
  await large.context.close();
  assert.deepEqual(errors,[]);assert.deepEqual(assetErrors,[]);
  await writeFile(output+'audit.json',JSON.stringify({passed:cases.length,cases,pageErrors:errors,assetErrors},null,2)+'\n');
  console.log(`Screenshots and audit: ${output}`);
} finally {await browser.close();}
