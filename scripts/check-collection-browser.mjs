import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {WEB_BANK_VERSION,bankContainsWord,bankWordEntry,createBankDictionary} from '../dist/core/dictionary-banks.js';
import {collectedWords,collectionTheme,COLLECTION_THEMES} from '../dist/core/collection-themes.js';
import {PERSONAL_PROGRESS_KEY} from '../dist/core/personal-progress.js';
import {summarizeWeek} from '../dist/core/weekly-review.js';

const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fileURLToPath(new URL('../.openai/tmp/collection-review/qa/',import.meta.url));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[],missing=[];
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=24&theme=alps',now=new Date('2026-10-16T12:00:00+08:00');
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const candidateWords=createBankDictionary([3,4,5,6,7,8,9,10]).words,themePools=new Map(COLLECTION_THEMES.map(theme=>[theme.id,[]]));
for(const word of candidateWords)themePools.get(collectionTheme(word,bankWordEntry(word))).push(word);
const seeds=['APPLE','BREAD'],usedSeeds=new Set([...seeds,'BIRD','SPICE']);while(seeds.length<21)for(const pool of themePools.values())if(pool.length&&seeds.length<21){const next=pool.shift();if(!usedSeeds.has(next)){usedSeeds.add(next);seeds.push(next);}}
assert.ok(seeds.every(word=>bankContainsWord(word,'wt-workbook')));
const entries=seeds.map((word,index)=>({word,language:'english',origin:'wt-workbook',firstFoundAt:`2026-10-${[12,14,15,16][index%4]}T02:00:00.000Z`}));
entries.push({word:seeds[0],language:'english',firstFoundAt:'2026-10-13T02:00:00.000Z'},...['BIRD','SPICE'].map(word=>({word,language:'english',origin:'wt-workbook',firstFoundAt:'2026-10-07T02:00:00.000Z'})));
const day=(seconds,levels,hints,targets,starts)=>({seconds,completedLevels:levels,hints,targets,starts,mistakes:0});
const sessions=[{id:'qa-manual-history',mode:'manual',startedAt:'2026-10-07T02:00:00.000Z',updatedAt:'2026-10-16T02:00:00.000Z',days:{'2026-10-07':day(224,2,4,8,2),'2026-10-12':day(130,2,2,9,2),'2026-10-14':day(45,1,0,4,1),'2026-10-16':day(97,1,1,4,1)}}];
const expected=summarizeWeek(collectedWords(entries,bankWordEntry),sessions,now);
async function createPage(seed=false,viewport={width:1440,height:1000}){
  const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await context.addInitScript(()=>{let state=Number(sessionStorage.getItem('qa-rng-state')||'0')>>>0;const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){state=(state+1)>>>0;sessionStorage.setItem('qa-rng-state',String(state));array[0]=state;return array;}return random(array);};});
  if(seed)await context.addInitScript(({entries,sessions,version,key})=>{
    if(sessionStorage.getItem('collection-qa-seeded'))return;
    localStorage.setItem('wordtiles.collection.v1',JSON.stringify({version:2,policyVersion:version,entries}));
    localStorage.setItem(key,JSON.stringify({version:1,sessions}));sessionStorage.setItem('collection-qa-seeded','1');
  },{entries:Array.isArray(seed)?seed:entries,sessions:Array.isArray(seed)?[]:sessions,version:WEB_BANK_VERSION,key:PERSONAL_PROGRESS_KEY});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url());});
  await page.clock.install({time:now});await page.goto(url);await ready(page);return {page,context};
}
async function ready(page){await page.waitForFunction(()=>!document.getElementById('start-game').disabled);}
async function fits(page,id){
  const result=await page.locator(id).evaluate(dialog=>{
    const r=dialog.getBoundingClientRect(),stage=document.querySelector(document.getElementById('lobby').hidden?'#game-viewport':'.lobby-panel').getBoundingClientRect();
    return {screen:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,stage:r.left>=stage.left-1&&r.right<=stage.right+1&&r.top>=stage.top-1&&r.bottom<=stage.bottom+1,overflow:dialog.scrollWidth>dialog.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(result.screen,true,JSON.stringify(result));assert.equal(result.stage,true,JSON.stringify(result));assert.equal(result.overflow,false,JSON.stringify(result));
}
async function shot(page,name,id='.lobby-panel'){await page.mouse.move(0,0);await page.locator(id).screenshot({path:output+name+'.png'});}
async function exportLevel(page){const pending=page.waitForEvent('download');await page.locator('#file-action').selectOption('export');const file=output+'manual-level.json';await(await pending).saveAs(file);return JSON.parse(await readFile(file,'utf8'));}
async function drag(page,path){const points=await Promise.all(path.map(cell=>page.locator(`[data-cell="${cell}"]`).boundingBox().then(r=>({x:r.x+r.width/2,y:r.y+r.height/2}))));await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}
const ledger=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{"sessions":[]}').sessions,PERSONAL_PROGRESS_KEY);
const totals=records=>records.flatMap(record=>Object.values(record.days)).reduce((s,d)=>({seconds:s.seconds+d.seconds,levels:s.levels+d.completedLevels,hints:s.hints+d.hints}),{seconds:0,levels:0,hints:0});
try{
  const empty=await createPage();let page=empty.page;
  await page.locator('#dictionary-button').click();assert.equal(await page.locator('.theme-card').count(),0);assert.equal(await page.locator('.dictionary-entry').count(),0);assert.equal(await page.locator('#dictionary-empty').isVisible(),true);await fits(page,'#dictionary-dialog');await shot(page,'collection-empty','#dictionary-dialog');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dictionary-button').evaluate(e=>e===document.activeElement),true);
  await page.locator('#weekly-button').click();assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),'0');assert.equal(await page.locator('[data-metric="levels"] .weekly-metric-value').innerText(),'—');assert.equal(await page.locator('#weekly-highlights li').count(),0);await fits(page,'#weekly-dialog');await shot(page,'weekly-empty','#weekly-dialog');await page.locator('#weekly-close').click();
  pass('空收藏册仅显示空态，空周回顾不捏造试玩成绩，Escape恢复焦点');

  await page.locator('#start-game').click();const level=await exportLevel(page);await page.clock.fastForward(10000);assert.equal((await ledger(page)).length,0);
  await page.locator('#manual-play-start').click();await page.clock.fastForward(3500);await page.locator('#hint').click();
  for(const target of level.targets)await drag(page,target.path||target.canonicalPath);
  await page.locator('#level-complete-dialog').waitFor({state:'visible'});await page.locator('#complete-review').click();await page.locator('#back-lobby').click();
  const manual=totals(await ledger(page));assert.equal(manual.levels,1);assert.equal(manual.hints,1);assert.ok(manual.seconds>=3.5);
  await page.clock.fastForward(60000);assert.equal(totals(await ledger(page)).seconds,manual.seconds);
  await page.locator('#weekly-button').click();assert.equal(await page.locator('[data-metric="levels"] .weekly-metric-value').innerText(),'1');assert.equal(await page.locator('[data-metric="hints"] .weekly-metric-value').innerText(),'1');assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),String(new Set(level.targets.map(t=>t.word)).size));await page.locator('#weekly-close').click();
  pass('等待开始与停留大厅均不计时，真实连词通关和提示即时进入周回顾');

  await page.locator('#start-game').click();await page.locator('[data-lab-tab="simulate"]').click();await page.locator('#sim-repeats').fill('10');await page.locator('#sim-batch-start').click();
  await page.waitForFunction(()=>document.getElementById('sim-status').textContent.includes('批量试玩完成'));
  assert.equal(await page.locator('#level-complete-dialog').isVisible(),false);await page.locator('#back-lobby').click();
  assert.deepEqual(totals(await ledger(page)),manual);
  await page.locator('#weekly-button').click();assert.equal(await page.locator('[data-metric="levels"] .weekly-metric-value').innerText(),'1');await page.locator('#weekly-close').click();await empty.context.close();
  pass('机器试玩不计个人成绩，个人历史保留已完成的真人关卡');

  const seeded=await createPage(true);page=seeded.page;await shot(page,'lobby-desktop');
  assert.equal(await page.locator('#dictionary-count').textContent(),'23');await page.locator('#dictionary-button').click();
  assert.equal(await page.locator('.theme-card').count(),8);assert.equal(await page.locator('[data-word="APPLE"]').count(),1);assert.equal(await page.locator('.dictionary-entry').count(),23);
  await shot(page,'collection-desktop','#dictionary-dialog');
  await page.locator('.theme-card[data-theme="food"]').click();assert.ok(await page.locator('.dictionary-entry').count()>0);assert.ok((await page.locator('.dictionary-entry').evaluateAll(es=>es.map(e=>e.dataset.theme))).every(theme=>theme==='food'));
  await page.locator('#dictionary-search').fill('bread');assert.deepEqual(await page.locator('.dictionary-entry').evaluateAll(es=>es.map(e=>e.dataset.word)),['BREAD']);
  await page.locator('#dictionary-search').fill('ZZZQQQ');assert.equal(await page.locator('.dictionary-entry').count(),0);await page.locator('#collection-reset').click();assert.equal(await page.locator('.dictionary-entry').count(),23);await page.locator('#dictionary-close').click();
  pass('已收藏词按八类整理且同词去重，主题与搜索共同筛选，重置恢复全部收藏');

  await page.locator('#activity-button').click();assert.equal(await page.locator('.calendar-day').count(),31);assert.equal(await page.locator('.activity-words span').count(),23);
  await page.locator('.calendar-day[data-date="2026-10-07"]').click();assert.deepEqual(await page.locator('.activity-words span').allTextContents(),['BIRD','SPICE']);await page.locator('#activity-show-month').click();await shot(page,'calendar-preserved','#activity-dialog');
  await page.locator('#activity-weekly').click();assert.equal(await page.locator('#activity-dialog').isVisible(),false);assert.equal(await page.locator('#weekly-dialog').isVisible(),true);
  assert.equal(await page.locator('#weekly-range').innerText(),'10.12 — 10.18');assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),String(expected.words));assert.equal(await page.locator('[data-metric="levels"] .weekly-metric-value').innerText(),'4');assert.equal(await page.locator('[data-metric="seconds"] .weekly-metric-value').innerText(),'4:32');assert.equal(await page.locator('[data-metric="hints"] .weekly-metric-value').innerText(),'3');
  assert.match(await page.locator('[data-metric="levels"] .weekly-comparison').innerText(),/\+2/);assert.equal(await page.locator('#weekly-days>div').count(),7);assert.equal(await page.locator('#weekly-highlights>li').count(),3);await shot(page,'weekly-desktop','#weekly-dialog');
  await page.locator('#weekly-prev').click();assert.equal(await page.locator('#weekly-range').innerText(),'10.5 — 10.11');assert.equal(await page.locator('[data-metric="words"] .weekly-metric-value').innerText(),'2');await page.locator('#weekly-next').click();assert.equal(await page.locator('#weekly-next').isDisabled(),true);await page.locator('#weekly-close').click();
  pass('原收词日历与每日记录保留，周一为界的周统计、上周对比、足迹和亮点均与存储数据一致');

  for(const [width,height] of [[1440,1000],[390,844],[360,640],[320,568],[844,390]]){
    await page.setViewportSize({width,height});await page.locator('#dictionary-button').click();await fits(page,'#dictionary-dialog');
    assert.equal(await page.locator('#collection-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    if(width===390||width===360){await shot(page,`collection-${width}`,'#dictionary-dialog');}
    await page.locator('#collection-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('#dictionary-close').click();await page.locator('#weekly-button').click();await fits(page,'#weekly-dialog');
    assert.equal(await page.locator('#weekly-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);assert.equal(await page.locator('#weekly-continue').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),true);
    if(width===390||width===360){await shot(page,`weekly-${width}`,'#weekly-dialog');}
    await page.locator('#weekly-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);if(width===390)await shot(page,'weekly-390-highlights','#weekly-dialog');await page.locator('#weekly-close').click();
  }
  await page.setViewportSize({width:390,height:844});await shot(page,'lobby-mobile');await seeded.context.close();
  pass('桌面、390/360/320手机与横屏弹窗适配，内容可滚动且关闭与继续按钮始终可见');

  const largeEntries=createBankDictionary([3,4,5,6,7,8,9,10]).words.slice(0,240).map(word=>({word,language:'english',origin:'web-supplied',firstFoundAt:'2026-10-14T02:00:00.000Z'}));
  const large=await createPage(largeEntries,{width:360,height:640});page=large.page;await page.locator('#dictionary-button').click();
  assert.equal(await page.locator('.dictionary-entry').count(),60);assert.equal(await page.locator('#dictionary-count').innerText(),'240');
  for(const count of [120,180,240]){await page.locator('#dictionary-more').click();assert.equal(await page.locator('.dictionary-entry').count(),count);}
  assert.equal(await page.locator('#dictionary-more').isVisible(),false);assert.equal(await page.locator('#collection-scroll').evaluate(e=>e.scrollHeight>e.clientHeight),true);await fits(page,'#dictionary-dialog');await page.locator('#dictionary-close').click();await large.context.close();
  pass('240词收藏分页完整展开，只有已收录词进入卡片，长列表在弹窗内滚动');

  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await writeFile(output+'results.json',JSON.stringify({checks,errors,missing,url},null,2));console.log(`TOTAL ${checks.length}/${checks.length}`);
}finally{await browser.close();}
