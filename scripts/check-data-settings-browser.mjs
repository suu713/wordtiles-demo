import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {bankContainsWord,createBankDictionary} from '../dist/core/dictionary-banks.js';
import {DATA_RESET_KEY,PREVIEW_COLLECTION_KEY} from '../dist/core/app-data.js';
const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fileURLToPath(new URL('../.openai/tmp/data-settings/qa/',import.meta.url));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],checks=[];
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=26&theme=alps';
const watch=p=>p.on('pageerror',e=>errors.push(e.message)),pass=name=>{checks.push(name);console.log('PASS '+name);};watch(page);
// Keep browser setup repeatable, including startup after clearing generated levels.
const pinInitialGameSeed=()=>{let state=Number(sessionStorage.getItem('qa-rng-state')||'0')>>>0;const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){state=(state+1)>>>0;sessionStorage.setItem('qa-rng-state',String(state));array[0]=state;return array;}return random(array);};};
await context.addInitScript(pinInitialGameSeed);
const ready=p=>p.waitForFunction(()=>!document.getElementById('start-game').disabled);
const stored=p=>p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wordtiles-generated-sequence',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('state','readonly'),get=t.objectStore('state').get('sequence');get.onsuccess=()=>resolve(get.result);t.oncomplete=()=>db.close();get.onerror=()=>reject(get.error);};r.onerror=()=>reject(r.error);}));
try{
  await page.goto(url);await ready(page);await page.evaluate(()=>{localStorage.setItem('qa-unrelated','keep');sessionStorage.setItem('qa-unrelated','keep');});
  await page.locator('#lobby-settings').click();assert.equal(await page.locator('#clear-all-data').isVisible(),true);await page.locator('#preview-collection').click();await page.locator('#dictionary-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#dictionary-count').innerText(),'300');assert.equal(await page.locator('.theme-card').count(),8);assert.equal(await page.locator('.collection-banner,.collection-eyebrow,.theme-preview').count(),0);
  const collection=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordtiles.collection.v1')));
  assert.equal(collection.entries.length,300);assert.equal(new Set(collection.entries.map(e=>e.word)).size,300);assert.ok(collection.entries.every(e=>bankContainsWord(e.word,'wt-workbook')));
  await page.screenshot({path:output+'preview-collection.png'});await page.locator('#dictionary-close').click();await page.locator('#weekly-button').click();assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),'300');assert.equal(await page.locator('[data-metric="levels"] .weekly-metric-value').innerText(),'—');assert.equal(await page.locator('.weekly-hero,.collection-eyebrow').count(),0);await page.screenshot({path:output+'preview-weekly.png'});await page.locator('#weekly-close').click();
  pass('设置内随机收录300个当前词库新词，八类覆盖，回顾更新且没有虚构试玩数据');

  await page.reload();await ready(page);assert.equal(await page.locator('#dictionary-count').innerText(),'300');
  const other=await context.newPage();watch(other);await other.goto(url);await ready(other);assert.equal(await other.locator('#dictionary-count').innerText(),'300');
  await other.locator('#start-game').click();await other.locator('[data-lab-tab="simulate"]').click();await other.locator('.human-settings summary').click();await other.locator('#human-start').click();await other.locator('#hint').click();await other.locator('#human-finish').click();await other.locator('#human-start').click();
  await page.waitForFunction(()=>localStorage.getItem('wordtiles.playtests.v1')&&localStorage.getItem('wordtiles.personal-progress.v1'));
  await page.evaluate(()=>{localStorage.setItem('wordtiles.playtest.profile.v1',JSON.stringify({test:'reset'}));});
  const oldSeeds=new Set((await stored(page)).levels.map(e=>e.level.seed));assert.ok(oldSeeds.size>0);
  pass('300词刷新及第二页签可见，清除前建立真实试玩记录、计时和关序');

  await page.locator('#lobby-settings').click();await Promise.all([page.waitForNavigation(),page.locator('#clear-all-data').click()]);await ready(page);await other.waitForFunction(()=>document.getElementById('lobby').hidden===false&&document.getElementById('dictionary-count').textContent==='0');
  await page.waitForFunction(()=>document.getElementById('dictionary-count').textContent==='0'&&document.getElementById('lobby-status').textContent.includes('已清除'));assert.match(await page.locator('#lobby-status').innerText(),/已清除/);
  await page.waitForTimeout(800);
  const remaining=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('wordtiles.')));
  assert.deepEqual(remaining,[DATA_RESET_KEY]);assert.equal(await page.evaluate(()=>localStorage.getItem('qa-unrelated')),'keep');assert.equal(await page.evaluate(()=>sessionStorage.getItem('qa-unrelated')),'keep');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),PREVIEW_COLLECTION_KEY),null);
  const clean=await stored(page);assert.ok(clean.levels.every(e=>!oldSeeds.has(e.level.seed)));
  await other.close();await page.reload();await ready(page);assert.equal(await page.locator('#dictionary-count').innerText(),'0');assert.equal(await page.evaluate(()=>localStorage.getItem('wordtiles.playtests.v1')),null);
  await page.locator('#weekly-button').click();assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),'0');await page.locator('#weekly-close').click();
  pass('一键清除收藏、回顾、真人记录、模型和旧自建关卡，活动页签重置且关闭/刷新不恢复旧数据');

  for(const [width,height] of [[390,844],[320,568]]){
    await page.setViewportSize({width,height});await page.locator('#lobby-settings').click();const fit=await page.locator('#clear-all-data').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;});assert.equal(fit,true);await page.screenshot({path:output+`settings-${width}.png`});await page.locator('#settings-close').click();
  }
  pass('手机设置中的随机收词和清除按钮可见，无横向溢出');

  const external=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Shanghai'});
  await external.addInitScript(pinInitialGameSeed);
  await external.addInitScript(seedWords=>{
    if(sessionStorage.getItem('qa-eight-seeded'))return;sessionStorage.setItem('qa-eight-seeded','1');
    localStorage.setItem('wordtiles.collection.v1',JSON.stringify({version:2,policyVersion:'old-local-profile',entries:seedWords.map(word=>({word,language:'english',origin:'wt-workbook',firstFoundAt:'2026-10-14T04:00:00.000Z'}))}));
  },createBankDictionary([3,4,5,6,7,8,9,10]).words.slice(0,8));
  const externalPage=await external.newPage();watch(externalPage);await externalPage.goto(url);await ready(externalPage);assert.equal(await externalPage.locator('#dictionary-count').innerText(),'8');
  const before=await externalPage.evaluate(()=>JSON.parse(localStorage.getItem('wordtiles.collection.v1')).entries);
  await externalPage.goto(url+'&preview=300');await ready(externalPage);await externalPage.locator('#dictionary-dialog').waitFor({state:'visible'});
  assert.equal(await externalPage.locator('#dictionary-count').innerText(),'300');assert.equal(new URL(externalPage.url()).searchParams.has('preview'),false);
  const after=await externalPage.evaluate(()=>JSON.parse(localStorage.getItem('wordtiles.collection.v1')).entries);assert.equal(after.length,300);assert.deepEqual(after.filter(entry=>before.some(old=>old.word===entry.word)),before);
  assert.equal(await page.locator('#dictionary-count').innerText(),'0');
  await externalPage.goto(url+'&preview=300');await ready(externalPage);await externalPage.locator('#dictionary-dialog').waitFor({state:'visible'});assert.equal(await externalPage.locator('#dictionary-count').innerText(),'300');
  await externalPage.screenshot({path:output+'external-eight-to-300.png'});await externalPage.locator('#dictionary-close').click();await externalPage.reload();await ready(externalPage);assert.equal(await externalPage.locator('#dictionary-count').innerText(),'300');
  await externalPage.locator('#lobby-settings').click();await Promise.all([externalPage.waitForNavigation(),externalPage.locator('#clear-all-data').click()]);await ready(externalPage);assert.equal(await externalPage.locator('#dictionary-count').innerText(),'0');await externalPage.reload();await ready(externalPage);assert.equal(await externalPage.locator('#dictionary-count').innerText(),'0');await external.close();
  pass('独立Chrome会话从8词补足到300，保留原记录，重复/刷新不累加，清除后不自动重新填入');
  assert.deepEqual(errors,[]);await writeFile(output+'results.json',JSON.stringify({checks,errors,url},null,2));console.log(`TOTAL ${checks.length}/${checks.length}`);
}catch(e){await page.screenshot({path:output+'failure.png'});throw e;}finally{await browser.close();}
