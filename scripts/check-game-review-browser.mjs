import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {convertSourceLevel} from '../dist/core/source-levels.js';
import {createBaseDictionary} from '../dist/core/target-policy.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {BONUS_DICTIONARY,wordEntryFor,GAME_POLICY_VERSION} from '../dist/core/word-source.js';
import {calculateLevelStatistics} from '../dist/core/level-statistics.js';
import {findWordPaths} from '../dist/core/rules.js';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=15';
const dir=fileURLToPath(new URL(process.env.REVIEW_REPORT_DIR||'../reports/',import.meta.url));await mkdir(dir,{recursive:true});
const fixture=await json('../examples/tsv/seed_20261010.json'),dictionary=createBaseDictionary([3,3,3,4,5]);
const bank=await json('../dist/source-levels/english.json'),oldFixture=await json('../examples/history/tsv-v1-seed_20261010.json');
const session=createAlgorithmSession(fixture,dictionary),extra=calculateLevelStatistics(session.initial,BONUS_DICTIONARY).extraWords[0];
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
const errors=[],cases=[];page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{cases.push({name,passed:true});console.log('PASS '+name);};
const ready=()=>page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
const counts=()=>page.locator('.tile').evaluateAll(t=>t.map(x=>Number(x.dataset.remaining)));
const targets=()=>page.locator('.target.completed').evaluateAll(t=>t.map(x=>x.dataset.word));
async function drag(path){const p=await Promise.all(path.map(async c=>{const r=await page.locator('[data-cell="'+c+'"]').boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};}));await page.mouse.move(p[0].x,p[0].y);await page.mouse.down();for(const q of p.slice(1))await page.mouse.move(q.x,q.y);await page.mouse.up();}
async function load(level){await page.locator('#import-file').setInputFiles({name:'original-word-proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(level))});await page.waitForFunction(id=>document.querySelector('#active-seed').textContent===String(id),level.source.original.id);if(await page.locator('.editor-panel').isVisible())await page.locator('#editor-close').click();}
try{
 await page.addInitScript(()=>{
  if(localStorage.getItem('wordtiles.review-test-seeded'))return;
  localStorage.setItem('wordtiles.review-test-seeded','1');localStorage.setItem('unrelated-review-test','keep');
  const date='2026-10-10T12:00:00.000Z';
  localStorage.setItem('wordtiles.collection.v1',JSON.stringify({version:2,policyVersion:'old-restricted',entries:['CAT','GOOSE','NATURAL'].map(word=>({word,language:'english',firstFoundAt:date})),archivedEntries:[...['BRA','RATED'].map(word=>({word,language:'english',firstFoundAt:date})),{word:'AÑO',language:'spanish',firstFoundAt:date}]}));
 });
 await page.goto(url);await ready();assert.equal(await page.locator('#dictionary-count').textContent(),'6');
 await page.locator('#dictionary-button').click();assert.deepEqual(await page.locator('.dictionary-word-row strong').allTextContents(),['AÑO','BRA','CAT','GOOSE','NATURAL','RATED']);
 await page.locator('#dictionary-search').fill('BRA');assert.deepEqual(await page.locator('.dictionary-entry p').allTextContents(),['n. 文胸；胸罩']);
 await page.locator('#dictionary-search').fill('');assert.ok(!/(奶罩|性交|白痴)/u.test(await page.locator('#dictionary-dialog').innerText()));
 await page.screenshot({path:dir+'/review-dictionary-mobile.png',fullPage:true});await page.locator('#dictionary-close').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-review-test')),'keep');pass('旧归档中的BRA、RATED和西语收藏恢复，释义与首次日期保留');

 await page.locator('#start-game').click();assert.deepEqual(await counts(),fixture.initialCounts);await page.locator('#editor-toggle').click();
 assert.deepEqual(await page.locator('#source-language option').evaluateAll(o=>o.map(x=>x.value)),['english','portuguese','russian','spanish','turkish']);
 const shipped=await page.evaluate(async()=>{const [lib,cat]=await Promise.all(['wordlist.json?v=15','source-levels/catalogue.json?v=15'].map(async p=>(await fetch(p)).json()));return{review:lib.review,words:lib.entries.map(e=>e.word),total:cat.total};});
 assert.equal(shipped.words.length,7618);assert.equal(shipped.review.version,GAME_POLICY_VERSION);assert.deepEqual(shipped.words,BONUS_DICTIONARY.words);assert.equal(shipped.total,13216);
 await page.locator('#editor-close').click();pass('五语言13216原包关卡完整开放，7618词运行库包含所有原包英文词');

 const before=await counts();await drag(findWordPaths(fixture.letters,extra,null,null,session.initial.board)[0]);assert.deepEqual(await counts(),before);assert.equal(await page.locator('#bonus-count').textContent(),'1');
 await drag(fixture.targets[0].canonicalPath);assert.deepEqual(await targets(),[fixture.targets[0].word]);await page.locator('#back-lobby').click();assert.equal(await page.locator('#dictionary-count').textContent(),'8');
 await page.reload();await ready();assert.equal(await page.locator('#dictionary-count').textContent(),'8');pass('正常目标和额外词继续收录，额外词不扣次数，刷新保留收藏');

 await page.locator('#start-game').click();const proof=convertSourceLevel({id:1,width:3,height:3,letters:'BRA,AAR,RGT',target_words:['BAR','RAG','ART'].map(word=>({word,type:0})),extra_words:[{word:'BRA',type:0}]},{language:'english'});
 await load(proof);const proofBefore=await counts();await drag([0,1,2]);assert.equal(await page.locator('.invalid-word').count(),0);assert.equal(await page.locator('#bonus-count').textContent(),'1');assert.deepEqual(await counts(),proofBefore);assert.deepEqual(await targets(),[]);assert.equal(await page.locator('#extra-word-count').textContent(),'1');
 await page.locator('#bonus-button').click();assert.deepEqual(await page.locator('#bonus-words li').allTextContents(),['BRA']);await page.locator('#bonus-close').click();await drag([0,1,2]);assert.equal(await page.locator('#bonus-count').textContent(),'1');await page.screenshot({path:dir+'/review-bra-accepted.png',fullPage:true});pass('真实滑出BRA收入额外词包，计数去重、次数不变、无错误红格');

 const raw=Object.values(bank.levels).find(l=>l.target_words.some(t=>t.word==='BRA')),level=convertSourceLevel(raw,{language:'english'});await load(level);await drag(level.targets.find(t=>t.word==='BRA').path);assert.deepEqual(await targets(),['BRA']);
 const targetBefore=await counts();await page.locator('#import-file').setInputFiles({name:'old-cache.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldFixture))});await page.locator('#notice').filter({hasText:'关卡词库版本'}).waitFor({state:'attached'});assert.deepEqual(await counts(),targetBefore);assert.deepEqual(await targets(),['BRA']);pass('原包BRA目标关可正常提交；旧版本导入拒绝且保留当前进度');

 const russian=await json('../dist/source-levels/russian.json'),r=Object.values(russian.levels).find(l=>l.extra_words.length),rl=convertSourceLevel(r,{language:'russian'});await load(rl);const rw=r.extra_words[0].word,rp=findWordPaths(rl.board.letters,rw,null,null,rl.board)[0],rbefore=await counts();await drag(rp);assert.deepEqual(await counts(),rbefore);await page.locator('#back-lobby').click();await page.locator('#dictionary-button').click();await page.locator('#dictionary-search').fill(rw);assert.deepEqual(await page.locator('.dictionary-word-row strong').allTextContents(),[rw]);await page.locator('#dictionary-close').click();pass('真实俄语额外词可以连接和永久收录，不受ASCII词库限制');

 const old={...dictionary,version:oldFixture.dictionaryVersion,metadata:{...dictionary.metadata,wordlistVersion:'old'}};
 const result=await page.evaluate(data=>new Promise((resolve,reject)=>{const w=new Worker(new URL('./generator.worker.js?v=15',location.href),{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(new Error('Worker timeout'));},20000);w.onmessage=e=>{if(e.data.type==='progress')return;clearTimeout(timer);w.terminate();resolve(e.data);};w.onerror=e=>{clearTimeout(timer);w.terminate();reject(new Error(e.message));};w.postMessage({requestId:1,config:{},dictionary:data,seed:20261010});}),old);
 assert.equal(result.result.ok,false);assert.equal(result.result.code,'DICTIONARY_POLICY');pass('真实Worker拒绝旧词库，未跳过路径、次数或版本校验');
 assert.deepEqual(errors,[]);await writeFile(dir+'/game-review-browser.json',JSON.stringify({url,reviewVersion:GAME_POLICY_VERSION,passed:cases.length,pageErrors:errors,cases},null,2)+'\n');console.log('TOTAL '+cases.length+'/'+cases.length+', page errors: '+errors.length);
}finally{await browser.close();}
