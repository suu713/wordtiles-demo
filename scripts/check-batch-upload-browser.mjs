import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {convertWTLevel} from '../dist/core/wt-source-session.js';

const require=createRequire(import.meta.url),{chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../.openai/tmp/batch-upload/qa/',import.meta.url));await mkdir(out,{recursive:true});
const dictionary=createBankDictionary([3,4,5]);
const levels=[88,89,90].map(seed=>{
  const result=generateLevel({maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000},dictionary,seed,{levelConfig:{rows:2,cols:2,wordLengths:[4]}});
  assert.equal(result.ok,true,result.message);return result.level;
});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));const pass=name=>{checks.push(name);console.log('PASS '+name);};
const upload=async(name,value)=>{
  await page.locator('#batch-upload-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
  await page.waitForFunction(()=>/已载入|上传失败/.test(document.getElementById('batch-status').textContent));
};
const download=async id=>{const waiting=page.waitForEvent('download');await page.locator(id).click();return readFile(await(await waiting).path());};
const run=async(start,end,repeats=2)=>{
  await page.locator('#batch-start').fill(String(start));await page.locator('#batch-end').fill(String(end));await page.locator('#batch-repeats').fill(String(repeats));
  await page.locator('#batch-run').click();await page.waitForFunction(()=>document.getElementById('batch-status').textContent.startsWith('反跑完成'));
  return JSON.parse((await download('#batch-json')).toString('utf8'));
};
try{
  await page.goto(process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=47');
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled);await page.locator('#start-game').click();await page.locator('[data-lab-tab="batch"]').click();
  assert.equal(await page.locator('#batch-bank').count(),0);
  assert.doesNotMatch(await page.locator('#batch-form').innerText(),/已保存关序|新生成关卡|关卡范围/);
  assert.equal(await page.locator('#batch-upload').isVisible(),true);
  pass('范围下拉直接删除，保留手填起止序号和上传入口');

  const knownBefore=await page.locator('#web-level-list li').count();
  const chooser=page.waitForEvent('filechooser');await page.locator('#batch-upload').click();
  await(await chooser).setFiles({name:'three-levels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'generated-level-batch',dictionary,levels}))});
  await page.waitForFunction(()=>document.getElementById('batch-status').textContent.startsWith('已载入'));
  assert.equal(await page.locator('#batch-game').inputValue(),'uploaded');assert.equal(await page.locator('#batch-end').getAttribute('max'),'3');
  assert.equal(await page.locator('#web-level-list li').count(),knownBefore);
  await page.locator('#batch-runs').check();
  const report=await run(2,3);
  assert.deepEqual(report.levels.map(row=>row.position),[2,3]);assert.equal(report.runs.length,4);
  assert.deepEqual(report.levels.map(row=>row.targets),levels.slice(1).map(level=>level.targets.map(target=>target.word).join(' / ')));
  assert.equal(report.job.uploadedSource.name,'three-levels.json');assert.equal(Object.hasOwn(report.job,'uploadedLevels'),false);
  assert.equal(await page.locator('#web-level-list li').count(),knownBefore);
  assert.ok(report.runs.every(run=>run.mode==='ordinary'&&['won','gave-up'].includes(run.outcome)));
  const xlsx=await download('#batch-xlsx');assert.equal(xlsx.subarray(0,2).toString(),'PK');assert.ok(xlsx.toString('utf8').includes('three-levels.json'));
  await writeFile(out+'uploaded-analysis.json',JSON.stringify(report,null,2));await writeFile(out+'uploaded-analysis.xlsx',xlsx);
  await page.screenshot({path:out+'uploaded-results.png'});
  pass('上传批量JSON后仅反跑第2～3关，棋盘目标未重新生成，Excel/JSON保留文件来源');

  await upload('bad.json','{');assert.match(await page.locator('#batch-status').innerText(),/上传失败/);assert.equal(await page.locator('#batch-game').inputValue(),'uploaded');assert.equal(await page.locator('#batch-end').getAttribute('max'),'3');
  const corrupt=structuredClone(levels[1]);corrupt.board.counts[0]++;
  await upload('corrupt.json',{dictionary,levels:[levels[0],corrupt]});assert.match(await page.locator('#batch-status').innerText(),/第 2 关校验失败/);
  assert.match(await page.locator('#batch-range-note').innerText(),/three-levels.json/);
  const retained=JSON.parse((await download('#batch-json')).toString('utf8'));assert.deepEqual(retained.levels,report.levels);
  await page.locator('#batch-end').fill('4');await page.locator('#batch-run').click();assert.match(await page.locator('#batch-status').innerText(),/请检查/);
  assert.equal(await page.locator('#batch-cancel').isEnabled(),false);
  pass('坏JSON、损坏关卡和越界范围明确拒绝，原来源与已完成报告保留');

  await page.locator('#batch-results tr').first().click();await page.locator('[data-lab-tab="batch"]').click();
  const currentDownload=page.waitForEvent('download');await page.locator('#export').evaluate(button=>button.click());
  const current=JSON.parse(await readFile(await(await currentDownload).path(),'utf8'));
  assert.deepEqual(current.board,levels[1].board);assert.deepEqual(current.targets,levels[1].targets);
  pass('点击上传结果能回看对应关卡');

  await upload('sequence.json',{schemaVersion:1,dictionaries:[dictionary],levels:[{level:levels[2],dictionaryVersion:dictionary.version,number:500},{level:levels[0],dictionaryVersion:dictionary.version,number:501}]});
  const sequence=await run(1,1);assert.equal(sequence.levels[0].targets,levels[2].targets.map(target=>target.word).join(' / '));
  await upload('single.json',levels[0]);assert.equal(await page.locator('#batch-end').inputValue(),'1');
  assert.equal((await run(1,1)).levels[0].targets,levels[0].targets.map(target=>target.word).join(' / '));
  pass('关序与单关JSON均可上传，序号使用文件顺序');

  const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url),'utf8')),raw=bank.levels[bank.orders.level_list_0[0]],original=convertWTLevel(raw,{order:'level_list_0',position:1});
  await upload('original.json',original);const originalReport=await run(1,1);
  assert.equal(originalReport.levels[0].id,raw.id);assert.equal(originalReport.levels[0].dictionaryOrigin,'wt-original-1.4.0');
  await page.locator('#batch-game').selectOption('wordtiles');await page.waitForFunction(()=>!document.getElementById('batch-run').disabled);
  assert.match(await page.locator('#batch-range-note').innerText(),/英文主线/);assert.equal(await page.locator('#batch-end').getAttribute('max'),'1500');
  const builtin=await run(1,2,1);assert.deepEqual(builtin.levels.map(row=>row.id),bank.orders.level_list_0.slice(0,2));
  pass('WT单关上传保留原包规则；内置来源按默认英文主线的手填范围运行');

  await page.locator('#batch-game').selectOption('uploaded');await page.locator('#batch-repeats').fill('1000');await page.locator('#batch-run').click();
  assert.equal(await page.locator('#batch-upload').isDisabled(),true);await page.locator('#batch-cancel').click();assert.match(await page.locator('#batch-status').innerText(),/已取消/);
  assert.equal(await page.locator('#batch-upload').isEnabled(),true);
  const previous=await page.locator('#batch-range-note').innerText();
  await page.route('**/playtest-import.worker.js*',route=>route.abort());
  await upload('worker-error.json',levels[0]);assert.match(await page.locator('#batch-status').innerText(),/上传失败/);assert.equal(await page.locator('#batch-range-note').innerText(),previous);
  await page.unroute('**/playtest-import.worker.js*');
  pass('运行中锁定上传，取消后恢复；上传Worker失败也保留原来源');
  await page.setViewportSize({width:390,height:844});await page.locator('#controls-open').click();await page.locator('#batch-upload').waitFor({state:'visible'});await page.screenshot({path:out+'mobile.png'});
  const box=await page.locator('.batch-source-picker').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
  assert.deepEqual(errors,[]);await writeFile(out+'checks.json',JSON.stringify({checks,errors},null,2));
}catch(error){await page.screenshot({path:out+'failure.png'});console.log(JSON.stringify({errors,status:await page.locator('#batch-status').innerText()}));throw error;}finally{await browser.close();}
