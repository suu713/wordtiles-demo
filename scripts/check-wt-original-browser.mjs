import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.WORDTILES_URL||'http://127.0.0.1:4173/',out=fileURLToPath(new URL('../../outputs/wt-source-reconnect-20261026/browser/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1800,height:1050}}),errors=[],failed=[],checks=[];
const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url),'utf8'));
page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))failed.push([r.status(),r.url()]);});
const pass=name=>{checks.push(name);console.log('PASS '+name);};
async function start(){await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);await page.locator('#start-game').click();}
async function selectLevel(order,position){
  await page.locator('[data-lab-tab="edit"]').click();
  if(!await page.locator('#source-order').isVisible())await page.locator('#controls-open').click();
  if(await page.locator('#source-order').inputValue()!==order)await page.locator('#source-order').selectOption(order);
  await page.waitForFunction(()=>!document.querySelector('#source-load').disabled);
  await page.locator('#source-number').selectOption(String(position));await page.locator('#source-load').click();
  await page.waitForFunction(id=>document.querySelector('#active-seed').textContent===String(id),bank.orders[order][position-1]);
}
async function swipe(word){
  const path=await page.evaluate(async word=>{
    const {findWordPaths}=await import('./core/rules.js?v=21');
    const tiles=[...document.querySelectorAll('#board .tile')],cols=Number(document.querySelector('#board').style.getPropertyValue('--cols'));
    const letters=tiles.map(t=>t.querySelector('.tile-letter').textContent),counts=tiles.map(t=>t.classList.contains('curtain-locked')?0:Number(t.dataset.remaining));
    return findWordPaths(letters,word,counts,null,{rows:tiles.length/cols,cols})[0];
  },word);
  assert.ok(path,word+' has visible path');
  const centers=[];for(const cell of path){const b=await page.locator(`#board [data-cell="${cell}"]`).boundingBox();centers.push({x:b.x+b.width/2,y:b.y+b.height/2});}
  await page.mouse.move(centers[0].x,centers[0].y);await page.mouse.down();for(const c of centers.slice(1))await page.mouse.move(c.x,c.y,{steps:6});await page.mouse.up();
  await page.waitForFunction(word=>document.querySelector(`#targets [data-word="${word}"]`).classList.contains('completed'),word);
}
async function exportLevel(p=page){const download=p.waitForEvent('download');await p.locator('#export').evaluate(b=>b.click());return JSON.parse(await readFile(await(await download).path(),'utf8'));}
try{
  await page.goto(base+'?source=wordtiles&list=level_list_0&level=1');await start();
  assert.equal(await page.locator('#play-source').inputValue(),'wordtiles');assert.equal(await page.locator('#active-seed').textContent(),'191596');
  assert.equal(await page.locator('#source-order option').count(),6);assert.equal(await page.locator('#source-number option').count(),1500);
  assert.equal(await page.locator('#board').getAttribute('data-row-order'),'bottom-up');pass('原包直达入口、4张主线＋每日＋全部、原关号与底部行序');
  await page.locator('#manual-play-start').click();for(const word of ['ICE','JOB','SUN'])await swipe(word);
  assert.equal(await page.locator('#level-complete-dialog').isVisible(),true);assert.match(await page.locator('#level-complete-summary').textContent(),/3 个目标全部完成/);await page.locator('#complete-next').click();
  await page.waitForFunction(()=>document.querySelector('#source-number').value==='2');pass('真实鼠标连词通关后跳转原表下一关');
  await selectLevel('level_list_2',31);assert.equal(await page.locator('#targets .target').count(),8);
  const lockedCount=await page.locator('.curtain-locked').count();assert.ok(lockedCount>0);
  assert.deepEqual(await page.locator('.curtain-locked .tile-letter').allTextContents(),Array(lockedCount).fill(''));
  await page.locator('#manual-play-start').click();await page.screenshot({path:out+'curtain-before.png',fullPage:true});
  const lock=page.locator('.curtain-locked').first();await lock.focus();await page.keyboard.press('Space');await page.keyboard.press('Enter');assert.equal(await page.locator('#targets .completed').count(),0);
  for(const word of ['DAD','OLD','COLD','HOLD']){await swipe(word);assert.equal(await page.locator('.curtain-locked').count(),lockedCount);}
  await swipe('LOCK');assert.equal(await page.locator('.curtain-locked').count(),0);assert.equal(await page.locator('#targets .completed').count(),5);assert.equal(await page.locator('#level-complete-dialog').isVisible(),false);
  for(const word of ['DUE','KEY','HOCKEY'])await swipe(word);assert.match(await page.locator('#level-complete-summary').textContent(),/8 个目标全部完成/);await page.locator('#complete-review').click();pass('113778 帘子阻断鼠标与键盘，5词开帘、8词才完成');
  await selectLevel('level_list_0',1);await page.locator('#manual-play-start').click();
  await page.locator('#fireworks').click();assert.equal(await page.locator('#targets .revealed').count(),5);
  await page.locator('#fireworks').click();assert.equal(await page.locator('#targets .completed').count(),3);assert.equal(await page.locator('#level-complete-dialog').isVisible(),true);await page.locator('#complete-review').click();pass('原包烟花每次揭最多5字母，整词揭完自动收词');
  for(const key of ['level_list_1','level_list_2','level_list_3','daily_puzzle_level_list','all']){await selectLevel(key,bank.orders[key].length);assert.equal(await page.locator('#source-next').isDisabled(),true);assert.equal(await page.locator('#active-seed').textContent(),String(bank.orders[key].at(-1)));}
  pass('全部6个列表首尾边界，原始ID准确');
  await selectLevel('level_list_0',1);const exported=await exportLevel();assert.deepEqual(exported.source.original,bank.levels[191596]);
  await page.locator('#import-file').setInputFiles({name:'original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await page.waitForFunction(()=>document.querySelector('#active-seed').textContent==='191596');pass('原关卡JSON导出与导入');
  await page.locator('[data-lab-tab="simulate"]').click();await page.locator('#sim-repeats').fill('3');await page.locator('#sim-batch-start').click();await page.waitForFunction(()=>document.querySelector('#sim-status').textContent.startsWith('批量试玩完成'));
  assert.match(await page.locator('#sim-status').textContent(),/3\/3 局.*0 局异常/);assert.equal(await page.locator('#level-complete-dialog').isVisible(),false);pass('原包当前关独立重复模拟，无弹窗打断');
  await page.locator('#sim-scope').selectOption('range');await page.locator('#sim-range-start').fill('1');await page.locator('#sim-range-end').fill('3');await page.locator('#sim-batch-start').click();await page.waitForFunction(()=>document.querySelector('#sim-status').textContent.startsWith('批量试玩完成'));
  assert.match(await page.locator('#sim-status').textContent(),/9\/9 局.*0 局异常/);assert.equal(await page.locator('#sim-range-results tr').count(),3);pass('原包范围模拟、逐关与总体均值');
  await page.locator('#sim-range-results tr').nth(1).click();await page.waitForFunction(()=>document.querySelector('#source-number').value==='2');pass('范围结果点击返回同表同一关');
  await page.locator('[data-lab-tab="batch"]').click();await page.locator('#batch-game').selectOption('wordtiles');await page.waitForFunction(()=>!document.querySelector('#batch-run').disabled);
  assert.equal(await page.locator('#batch-bank').count(),0);await page.locator('#batch-runs').check();await page.locator('#batch-start').fill('30');await page.locator('#batch-end').fill('32');await page.locator('#batch-repeats').fill('2');await page.locator('#batch-run').click();await page.waitForFunction(()=>document.querySelector('#batch-status').textContent.startsWith('反跑完成'));
  const jsonDownload=page.waitForEvent('download');await page.locator('#batch-json').click();const report=JSON.parse(await readFile(await(await jsonDownload).path(),'utf8'));
  assert.equal(report.levels.length,3);assert.equal(report.runs.length,6);assert.ok(report.runs.every(r=>['won','gave-up'].includes(r.outcome)&&r.mode==='ordinary'));assert.equal(report.levels[1].id,bank.orders.level_list_0[30]);assert.ok(report.levels.every(r=>r.dictionaryOrigin==='wt-original-1.4.0'&&r.bank==='level_list_0'&&!r.error));
  const xlsxDownload=page.waitForEvent('download');await page.locator('#batch-xlsx').click();const xlsx=await xlsxDownload;await xlsx.saveAs(out+'original-analysis.xlsx');await writeFile(out+'original-analysis.json',JSON.stringify(report,null,2));assert.equal((await readFile(out+'original-analysis.xlsx')).subarray(0,2).toString(),'PK');
  await page.screenshot({path:out+'batch-results.png',fullPage:true});pass('跨关普通玩家反跑与Excel/JSON导出含原ID、表名、规则版本');
  await page.locator('#batch-results tr').nth(1).click();await page.waitForFunction(id=>document.querySelector('#active-seed').textContent===String(id),bank.orders.level_list_0[30]);pass('反跑结果点击返回原关卡');
  await page.locator('[data-lab-tab="edit"]').click();await page.locator('#play-source').selectOption('web');await page.waitForFunction(()=>document.querySelector('#algorithm').value==='2'&&!document.querySelector('#play-source').disabled);
  const generated=await exportLevel();await page.locator('#play-source').selectOption('wordtiles');await page.waitForFunction(()=>document.querySelector('#algorithm').value==='1'&&!document.querySelector('#play-source').disabled);
  await page.locator('#play-source').selectOption('web');await page.waitForFunction(()=>document.querySelector('#algorithm').value==='2'&&!document.querySelector('#play-source').disabled);assert.deepEqual(await exportLevel(),generated);pass('生成模式正常使用且切换来源可恢复原生成关');
  await page.locator('#play-source').selectOption('wordtiles');await page.waitForFunction(()=>document.querySelector('#algorithm').value==='1'&&!document.querySelector('#play-source').disabled);await selectLevel('level_list_2',31);
  await page.locator('[data-lab-tab="simulate"]').click();await page.locator('#sim-scope').selectOption('range');await page.locator('#sim-range-start').fill('1');await page.locator('#sim-range-end').fill('20');await page.locator('#sim-repeats').fill('1000');await page.locator('#sim-batch-start').click();await page.locator('#sim-batch-stop').click();
  assert.match(await page.locator('#sim-status').textContent(),/已取消/);const stopped=await page.locator('#sim-status').textContent();await page.waitForTimeout(200);assert.equal(await page.locator('#sim-status').textContent(),stopped);pass('原包大范围模拟可取消，保留部分结果且不继续写入');
  await page.locator('[data-lab-tab="edit"]').click();
  const failurePage=await browser.newPage(),failureErrors=[];failurePage.on('pageerror',e=>failureErrors.push(e.message));
  await failurePage.route('**/source-levels/english.json',route=>route.fulfill({status:503,body:'Injected unavailable package'}));
  await failurePage.goto(base);await failurePage.waitForFunction(()=>!document.querySelector('#start-game').disabled);await failurePage.locator('#start-game').click();const retained=await exportLevel(failurePage);
  await failurePage.locator('#play-source').selectOption('wordtiles');await failurePage.waitForFunction(()=>!document.querySelector('#play-source').disabled&&document.querySelector('#source-change-status').textContent.length>0);
  assert.equal(await failurePage.locator('#play-source').inputValue(),'web');assert.deepEqual(await exportLevel(failurePage),retained);
  await failurePage.unroute('**/source-levels/english.json');await failurePage.locator('#play-source').selectOption('wordtiles');await failurePage.waitForFunction(()=>document.querySelector('#algorithm').value==='1'&&!document.querySelector('#play-source').disabled);
  assert.deepEqual(failureErrors,[]);await failurePage.close();pass('原包读取失败保留生成关，恢复文件后可重试接入');
  await page.setViewportSize({width:390,height:844});await page.locator('#editor-close').evaluate(b=>b.click());await page.screenshot({path:out+'mobile-curtain.png',fullPage:true});
  assert.ok((await page.locator('#board').boundingBox()).width<=390);pass('390宽手机视图棋盘可见');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);pass('无页面异常或资源404');
  await writeFile(out+'checks.json',JSON.stringify({checks,errors,failed},null,2));
}catch(e){await page.screenshot({path:out+'failure.png',fullPage:true});await writeFile(out+'failure.json',JSON.stringify({error:e.stack,errors,failed,notice:await page.locator('#notice').textContent(),status:await page.locator('#source-change-status').textContent()},null,2));throw e;}
finally{await browser.close();}
