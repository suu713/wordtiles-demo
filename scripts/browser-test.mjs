import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createBaseDictionary, isTargetAllowed, POLICY_VERSION } from '../dist/core/target-policy.js';
import { generateLevel } from '../dist/core/algorithm2.js';
import { createAlgorithmSession } from '../dist/core/algorithm-v1-adapter.js';
import { createFrequencyDictionary, WORDLIST_VERSION, BONUS_DICTIONARY, wordEntryFor } from '../dist/core/word-library.js';
import { findWordPaths } from '../dist/core/rules.js';
import { calculateLevelStatistics } from '../dist/core/level-statistics.js';
import { calculateLevelSolutions } from '../dist/core/level-solutions.js';
import { convertSourceLevel } from '../dist/core/source-levels.js';

const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const reports=fileURLToPath(new URL('../reports/',import.meta.url));
await mkdir(reports,{recursive:true});
const fixture=await json('../examples/tsv/seed_20261010.json'), dictionary=createBaseDictionary([3,3,3,4,5]);
const initial=createAlgorithmSession(fixture,dictionary,{bonusDictionary:BONUS_DICTIONARY});
const stats=calculateLevelStatistics(initial.initial,BONUS_DICTIONARY), solutions=calculateLevelSolutions(initial.initial,dictionary);
const source=await json('../dist/source-levels/english.json');
const baseURL=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=12';
const cases=[], errors=[];
let browser;
try { browser=await chromium.launch({headless:true,channel:'chrome'}); }
catch { browser=await chromium.launch({headless:true,channel:'msedge'}); }
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}), page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
const run=async(name,fn)=>{await fn();cases.push({name,passed:true});console.log('PASS '+name);};
async function state(tab=page) {
  return tab.evaluate(()=>({counts:[...document.querySelectorAll('.tile')].map(el=>Number(el.dataset.remaining)),
    completed:[...document.querySelectorAll('.target.completed')].map(el=>el.dataset.word),seed:document.querySelector('#active-seed').textContent,
    statistics:['extra-word-count','reverse-word-count','tile-used-2','tile-used-3','tile-used-4','tile-used-5','straight-word-count','one-turn-word-count','multi-turn-word-count'].map(id=>document.getElementById(id).textContent)}));
}
async function centers(path,tab=page) {
  return Promise.all(path.map(async cell=>{const r=await tab.locator(`[data-cell="${cell}"]`).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};}));
}
async function drag(path,tab=page) {
  const points=await centers(path,tab);
  await tab.mouse.move(points[0].x,points[0].y);await tab.mouse.down();
  for(const point of points.slice(1)) await tab.mouse.move(point.x,point.y);
  await tab.mouse.up();
}
async function reset(tab=page) {await tab.locator('#file-action').selectOption('sample');assert.deepEqual((await state(tab)).counts,fixture.initialCounts);}
async function exportLevel(name,tab=page) {
  const waiting=tab.waitForEvent('download');await tab.locator('#file-action').selectOption('export');const download=await waiting;
  const path=reports+'/'+name+'.json';await download.saveAs(path);return JSON.parse(await readFile(path,'utf8'));
}
async function settings(pane) {await page.locator('#options-menu').selectOption(pane);}
async function closeSettings() {await page.locator('#settings-close').click();}
async function generate(seed) {
  await page.locator('#seed').fill(String(seed));await page.locator('#generate-seed').click();
  await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({state:'attached'});
}
async function importRejected(level) {
  const before=await state();
  await page.locator('#import-file').setInputFiles({name:'rejected.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(level))});
  await page.locator('#notice').filter({hasText:'导入被拒绝'}).waitFor({state:'attached'});assert.deepEqual(await state(),before);
}
async function directWorker(input) {
  return page.evaluate(data=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./generator.worker.js?v=12',location.href),{type:'module'});
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},15000);
    worker.onmessage=({data})=>{if(data.type==='progress')return;clearTimeout(timeout);worker.terminate();resolve(data);};
    worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(new Error(event.message));};
    worker.postMessage({requestId:42,config:{},seed:20261010,...data});
  }),input);
}

try {
  await page.goto(baseURL);await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
  await run('首屏游戏大厅，词典icon右上角，点击开始才进入关卡',async()=>{
    assert.equal(await page.locator('#lobby').isVisible(),true);assert.equal(await page.locator('#game-screen').isVisible(),false);
    assert.equal(await page.locator('#dictionary-count').textContent(),'0');
    const icon=await page.locator('#dictionary-button').boundingBox(),panel=await page.locator('.lobby-panel').boundingBox();
    assert.ok(icon.x>panel.x+panel.width/2&&icon.y<panel.y+panel.height/4);
    await page.screenshot({path:reports+'/lobby-desktop.png',fullPage:true});
    await page.locator('#start-game').click();assert.equal(await page.locator('#lobby').isVisible(),false);assert.equal(await page.locator('#game-screen').isVisible(),true);
    assert.equal(await page.locator('#algorithm').inputValue(),'2');assert.equal(await page.locator('#hover-help').isVisible(),false);
  });
  await page.locator('#algorithm').selectOption('1');await page.locator('#validation-badge').filter({hasText:'需求不变量通过'}).waitFor({state:'attached'});
  await run('算法1原包对照仍正常载入，当前关卡不受英语目标白名单修改',async()=>{
    assert.equal(await page.locator('#algorithm').inputValue(),'1');
    const first=convertSourceLevel(source.levels[source.orders.main[0]],{language:'english',order:'main',position:1});
    for(const target of [...first.targets].reverse()) await drag(target.path);
    assert.deepEqual((await state()).counts,Array(9).fill(0));await page.locator('#restart').click();
  });
  await page.locator('#algorithm').selectOption('2');
  await run('算法2使用用户TSV的新样例及1470原形候选，不加载历史词库',async()=>{
    await page.locator('#validation-badge').filter({hasText:'32 / 32 通过'}).waitFor({state:'attached'});
    assert.deepEqual((await state()).counts,fixture.initialCounts);
    assert.deepEqual(await page.locator('.target').evaluateAll(items=>items.map(item=>item.dataset.word)),fixture.targets.map(t=>t.word));
    assert.equal(await page.locator('#dictionary-source').inputValue(),'common');
    assert.equal(await page.locator('#unreviewed-mode').count(),0);
    await settings('lexicon');assert.match(await page.locator('#lexicon-status').textContent(),/21,094 词 · 本关 1,470 个原形词/);await closeSettings();
    assert.match(await page.locator('#version-note').textContent(),new RegExp(POLICY_VERSION));
    const requested=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));
    assert.ok(!requested.some(url=>/\/(dictionary-v1|sample)\.json/.test(url)));
    assert.equal(await page.locator('.game-title-row').innerText(),'Word Tile');
    assert.deepEqual(await page.locator('.count-badge').allTextContents(),fixture.initialCounts.map(String));
    assert.equal(await page.locator('.target-letter').count(),18);
    await page.mouse.move(0,0);await page.screenshot({path:reports+'/tsv-desktop.png',fullPage:true});
  });
  await run('真实模块Worker使用完整V2对象，默认seed结果逐字段一致，旧词库旁路拒绝',async()=>{
    const result=await directWorker({dictionary});assert.equal(result.type,'result');assert.equal(result.result.ok,true);assert.deepEqual(result.result.level,fixture);
    for(const invalid of [dictionary.words,await json('../dist/dictionary-v1.json'),{...dictionary,words:[...dictionary.words,'RATED']}]) {
      const reply=await directWorker({dictionary:invalid});assert.equal(reply.result.ok,false);assert.equal(reply.result.code,'DICTIONARY_POLICY');assert.ok(!reply.result.level);
    }
    await generate(20261010);assert.deepEqual(await exportLevel('tsv-worker-export'),fixture);
  });
  await run('拖动FORTY经过目标FOR不提交，松手完成FORTY，共享格次数只减一次',async()=>{
    const hello=fixture.targets.find(t=>t.word==='FORTY'),points=await centers(hello.canonicalPath);
    await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
    for(const p of points.slice(1,3)) await page.mouse.move(p.x,p.y);
    assert.equal(await page.locator('#current-word').textContent(),'FOR');assert.deepEqual((await state()).counts,fixture.initialCounts);assert.deepEqual((await state()).completed,[]);
    for(const p of points.slice(3)) await page.mouse.move(p.x,p.y);await page.mouse.up();
    const expected=[...fixture.initialCounts];hello.canonicalPath.forEach(cell=>expected[cell]--);
    assert.deepEqual((await state()).counts,expected);assert.deepEqual((await state()).completed,['FORTY']);
  });
  await run('未知词只让格子变红，额外词收集去重不扣次数，包可查看和清空',async()=>{
    await reset();const before=await state();await drag([0,3,6]);
    assert.deepEqual(await state(),before);assert.equal(await page.locator('.invalid-word').count(),3);
    assert.ok(stats.extraWords.length>0);const bonus=stats.extraWords[0],path=findWordPaths(initial.initial.board.letters,bonus,null,null,initial.initial.board)[0];
    await drag(path);await drag(path);assert.deepEqual(await state(),before);assert.equal(await page.locator('#bonus-count').textContent(),'1');
    await page.locator('#bonus-button').click();assert.deepEqual(await page.locator('#bonus-words li').allTextContents(),[bonus]);await page.locator('#bonus-close').click();
    await page.locator('#restart').click();assert.equal(await page.locator('#bonus-count').textContent(),'0');
  });
  await run('提示箭头与路径方向一致，初始统计和解法词组使用本关V2词库',async()=>{
    const before=await state();await page.locator('#hint').click();assert.deepEqual(await state(),before);
    const path=fixture.targets[0].canonicalPath;
    assert.deepEqual(await page.locator('.hint-arrow').evaluateAll(items=>items.map(el=>[Number(el.dataset.from),Number(el.dataset.to)])),path.slice(1).map((cell,i)=>[path[i],cell]));
    assert.equal(before.statistics[0],String(stats.extraWords.length));assert.equal(before.statistics[1],`${stats.reverseWords.length} / 5`);
    await page.locator('#solutions-count').filter({hasText:`${solutions.count} 种`}).waitFor();await page.locator('#solutions-stat').click();
    const displayed=await page.locator('.solution-words').evaluateAll(items=>items.map(el=>[...el.children].map(child=>child.textContent)));
    assert.deepEqual(displayed,solutions.solutions.map(solution=>solution.words));assert.ok(displayed.flat().every(isTargetAllowed));
    await page.locator('#solutions-close').click();
    await drag(fixture.targets[0].canonicalPath);assert.deepEqual((await state()).statistics,before.statistics);
  });
  await run('旧LAD/OAT关卡和伪造违规关导入拒绝，当前关卡及试玩进度保留',async()=>{
    await importRejected(await json('../dist/sample.json'));await importRejected(await json('../examples/seed_20261010.json'));
    const illegal=structuredClone(fixture);illegal.targets[0].word='RATED';await importRejected(illegal);
    const broken=structuredClone(fixture);broken.initialCounts[0]++;await importRejected(broken);
    await page.locator('#import-file').setInputFiles({name:'v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('#level-kind').filter({hasText:'JSON 导入'}).waitFor();assert.deepEqual((await state()).counts,fixture.initialCounts);
  });
  await run('正序和反序真实滑动都能清空，重开和切算法保留各自关卡状态',async()=>{
    for(const order of [fixture.targets,[...fixture.targets].reverse()]) {
      await reset();for(const target of order) await drag(target.canonicalPath);
      assert.deepEqual((await state()).counts,Array(9).fill(0));assert.equal(await page.locator('#win-banner').isVisible(),true);
    }
    await page.locator('#restart').click();await drag(fixture.targets[0].canonicalPath);const before=await state();
    await page.locator('#algorithm').selectOption('1');await page.locator('#algorithm').selectOption('2');assert.deepEqual(await state(),before);
    await reset();
  });
  await run('预算耗尽不回退、不改当前进度；延迟Worker取消和切算法不会覆盖关卡',async()=>{
    await drag(fixture.targets[0].canonicalPath);const before=await state();await settings('debug');
    for(const id of ['#budget-attempt','#budget-tries','#budget-total']) await page.locator(id).fill('1');await closeSettings();
    await page.locator('#generate-seed').click();await page.waitForFunction(()=>document.querySelector('#debug-generation').textContent.includes('SEARCH_BUDGET_EXCEEDED'));
    assert.deepEqual(await state(),before);await settings('debug');
    await page.locator('#budget-attempt').fill('10000');await page.locator('#budget-tries').fill('30');await page.locator('#budget-total').fill('300000');await closeSettings();
    const workerSource=await readFile(new URL('../dist/generator.worker.js',import.meta.url),'utf8');
    await page.route('**/generator.worker.js?*',route=>route.fulfill({contentType:'text/javascript',body:workerSource+'\nconst run=self.onmessage;self.onmessage=event=>setTimeout(()=>run(event),500);'}));
    await page.locator('#generate-seed').click();await page.locator('#cancel-generation').click();await page.waitForTimeout(650);assert.deepEqual(await state(),before);
    await page.locator('#generate-seed').click();await page.locator('#algorithm').selectOption('1');await page.waitForTimeout(650);assert.equal(await page.locator('#algorithm').inputValue(),'1');
    await page.locator('#algorithm').selectOption('2');assert.deepEqual(await state(),before);await page.unroute('**/generator.worker.js?*');
  });
  await run('伪造Worker成功结果仍须导入门禁，违规目标不能出现在游戏',async()=>{
    const bad=structuredClone(fixture);bad.targets[0].word='RATED';const before=await state();
    await page.route('**/generator.worker.js?*',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>self.postMessage({type:'result',requestId:data.requestId,result:{ok:true,level:${JSON.stringify(bad)},stats:{nodes:1}}});`}));
    await page.locator('#generate-seed').click();await page.locator('#notice').filter({hasText:'关卡未通过校验'}).waitFor({state:'attached'});
    assert.deepEqual(await state(),before);assert.equal(await page.locator('.target[data-word="RATED"]').count(),0);await page.unroute('**/generator.worker.js?*');
  });
  await run('词频候选为白名单交集，空档位明确失败；版本不匹配导入拒绝，无未审核开关',async()=>{
    await page.locator('#dictionary-source').selectOption('graded');
    const graded=createFrequencyDictionary({wordLengths:[3,3,3,4,5],tiers:[1,2,3]});
    await generate(0);const level=await exportLevel('tsv-graded-worker-export');assert.deepEqual(level,generateLevel({},graded,0).level);
    assert.ok(level.targets.every(t=>isTargetAllowed(t.word)));await importRejected(fixture);
    for(const option of ['1','1,2','1,2,3','4','5','1,2,3,4,5']) {
      const before=await state();await settings('lexicon');await page.locator('#dictionary-tier').selectOption(option);
      const tiers=option.split(',').map(Number);const expected=createFrequencyDictionary({wordLengths:[3,3,3,4,5],tiers});
      await page.waitForFunction(()=>!document.querySelector('#lexicon-status').textContent.includes('正在读取'));
      assert.ok((await page.locator('#lexicon-status').textContent()).includes(`本关 ${expected.words.length.toLocaleString()} 个原形词`));
      assert.equal(await page.locator('#unreviewed-mode').count(),0);await closeSettings();assert.deepEqual(await state(),before);
      if(expected.words.length<5) assert.equal(await page.locator('#generate-seed').isDisabled(),true);
    }
    await page.locator('#dictionary-source').selectOption('common');await reset();
  });
  await run('目标与额外词自动收录，错误不收录，释义搜索、去重和刷新持久化',async()=>{
    const isolated=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),tab=await isolated.newPage();tab.on('pageerror',error=>errors.push(error.message));
    await tab.goto(baseURL);await tab.waitForFunction(()=>!document.querySelector('#start-game').disabled);
    await tab.locator('#dictionary-button').click();assert.equal(await tab.locator('#dictionary-empty').isVisible(),true);await tab.locator('#dictionary-close').click();
    await tab.locator('#start-game').click();await drag(fixture.targets[0].canonicalPath,tab);const partial=await state(tab);
    await tab.locator('#back-lobby').click();assert.equal(await tab.locator('#dictionary-count').textContent(),'1');
    await tab.locator('#start-game').click();assert.deepEqual(await state(tab),partial);
    await tab.locator('#restart').click();await drag(fixture.targets[0].canonicalPath,tab);
    await tab.locator('#restart').click();const bonus=stats.extraWords.find(word=>!isTargetAllowed(word));
    const path=findWordPaths(initial.initial.board.letters,bonus,null,null,initial.initial.board)[0];await drag(path,tab);await drag(path,tab);await drag([0,3,6],tab);
    await tab.locator('#back-lobby').click();assert.equal(await tab.locator('#dictionary-count').textContent(),'2');await tab.locator('#dictionary-button').click();
    assert.deepEqual((await tab.locator('.dictionary-word-row strong').allTextContents()).sort(),['FOR',bonus].sort());
    await tab.locator('#dictionary-search').fill('for');assert.deepEqual(await tab.locator('.dictionary-word-row strong').allTextContents(),['FOR',bonus].filter(word=>word.includes('FOR')).sort());
    assert.equal(await tab.locator('.dictionary-entry p').first().textContent(),wordEntryFor('FOR').definition);
    await tab.locator('#dictionary-search').fill(wordEntryFor('FOR').definition);assert.deepEqual(await tab.locator('.dictionary-word-row strong').allTextContents(),['FOR']);
    await tab.locator('#dictionary-search').fill('不存在的释义');assert.equal(await tab.locator('#dictionary-empty').isVisible(),true);
    await tab.locator('#dictionary-close').click();await tab.reload();await tab.waitForFunction(()=>!document.querySelector('#start-game').disabled);
    assert.equal(await tab.locator('#lobby').isVisible(),true);assert.equal(await tab.locator('#dictionary-count').textContent(),'2');
    await tab.locator('#dictionary-button').click();assert.equal(await tab.locator('.dictionary-entry').count(),2);
    await tab.screenshot({path:reports+'/dictionary-mobile.png',fullPage:true});await isolated.close();
  });
  await run('手机真实触屏松手提交，任意顺序清空；游戏和大厅在一个屏幕内',async()=>{
    const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'}),mobile=await mobileContext.newPage();
    mobile.on('pageerror',error=>errors.push(error.message));await mobile.goto(baseURL);
    await mobile.waitForFunction(()=>!document.querySelector('#start-game').disabled);
    await mobile.screenshot({path:reports+'/lobby-mobile.png',fullPage:true});await mobile.locator('#start-game').click();
    const cdp=await mobileContext.newCDPSession(mobile);
    for(const target of [...fixture.targets].reverse()) {
      const points=await centers(target.canonicalPath,mobile),before=await state(mobile);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});
      for(const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});
      assert.deepEqual(await state(mobile),before);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    assert.deepEqual((await state(mobile)).counts,Array(9).fill(0));
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
    await mobile.screenshot({path:reports+'/tsv-mobile-completed.png',fullPage:true});await mobileContext.close();
  });
  assert.deepEqual(errors,[]);
  await writeFile(reports+'/tsv-browser.json',JSON.stringify({url:baseURL,contentPolicyVersion:POLICY_VERSION,wordlistVersion:WORDLIST_VERSION,passed:cases.length,pageErrors:errors,cases},null,2)+'\n');
  console.log(`TOTAL ${cases.length}/${cases.length}, page errors: ${errors.length}`);
} catch(error) {
  await page.screenshot({path:reports+'/tsv-browser-failure.png',fullPage:true});
  await writeFile(reports+'/tsv-browser-failure.json',JSON.stringify({passed:cases.length,cases,pageErrors:errors,error:error.stack},null,2)+'\n');
  throw error;
} finally { await browser.close(); }
