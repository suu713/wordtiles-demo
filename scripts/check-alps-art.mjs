import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {RUNTIME_ART} from '../dist/core/art-theme.js';

const pack=new URL('../dist/art/alps/',import.meta.url);
const qa=new URL('../art-swap/alps-light-glass-20261016/qa/',import.meta.url);
await mkdir(qa,{recursive:true});
const cases=[],errors=[],missing=[],legacyRequests=[];
const pass=name=>{cases.push(name);console.log('PASS '+name);};
let verified=0;
for(const line of (await readFile(new URL('checksums.sha256',pack),'utf8')).trim().split(/\r?\n/)){
  const [,hash,path]=line.match(/^([a-f0-9]{64})\s+(.+)$/);
  assert.equal(createHash('sha256').update(await readFile(new URL(path,pack))).digest('hex'),hash,path);verified++;
}
assert.equal(RUNTIME_ART.length,20);
assert.ok(RUNTIME_ART.every(a=>!a.path.includes('fixed-layout-glass')));
pass('完整资源包159项校验，动态界面仅预载20张背景、底图与图标');
const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=22';
function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url());});page.on('request',r=>{if(r.url().includes('/art/paris/')||r.url().includes('/fixed-layout-glass/'))legacyRequests.push(r.url());});}
const background=(page,selector,pseudo=null)=>page.locator(selector).first().evaluate((e,p)=>getComputedStyle(e,p).backgroundImage,pseudo);
const counts=page=>page.locator('.tile').evaluateAll(es=>es.map(e=>Number(e.dataset.remaining)));
const capture=async(page,selector,name)=>{await page.mouse.move(0,0);await page.locator(selector).screenshot({path:fileURLToPath(new URL(name+'.png',qa))});};
async function hintPath(page){await page.locator('#fireworks').click();await page.locator('.fireworks-board-arrow').first().waitFor({state:'attached'});const arrows=await page.locator('.fireworks-board-arrow').evaluateAll(es=>es.map(e=>({from:Number(e.dataset.from),to:Number(e.dataset.to)})));assert.ok(arrows.length);return [arrows[0].from,...arrows.map(e=>e.to)];}
async function points(page,path){return Promise.all(path.map(cell=>page.locator(`[data-cell="${cell}"]`).boundingBox().then(r=>({x:r.x+r.width/2,y:r.y+r.height/2}))));}
async function drag(page,path){const ps=await points(page,path);await page.mouse.move(ps[0].x,ps[0].y);await page.mouse.down();for(const p of ps.slice(1))await page.mouse.move(p.x,p.y,{steps:3});await page.mouse.up();}
async function fits(page){
  const result=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),v=r('#game-viewport'),b=r('#board'),a=r('#targets'),u=r('.game-art-actions'),p=r('.play-panel');return {viewport:[v.left,v.top,v.right,v.bottom],board:[b.left,b.top,b.right,b.bottom],answersBottom:a.bottom,actionsTop:u.top,panel:[p.left,p.top,p.right,p.bottom],overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.equal(result.overflow,false);assert.ok(result.board[0]>=result.viewport[0]-1&&result.board[2]<=result.viewport[2]+1);assert.ok(result.board[3]<=result.viewport[3]+1);assert.ok(result.answersBottom<result.actionsTop);assert.ok(result.viewport[1]>=-1&&result.viewport[3]<=await page.evaluate(()=>innerHeight)+1);
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();watch(page);await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#start-game').disabled&&document.documentElement.dataset.artReady==='true');
  assert.equal(await page.getAttribute('html','data-art-theme'),'alps-light-glass');assert.match(await background(page,'.lobby-panel'),/bg-alps-lobby\.png/);
  for(const weight of [400,500,600])assert.equal(await page.evaluate(w=>document.fonts.check(w+' 20px "Nunito Sans"'),weight),true);
  assert.equal(await page.locator('.lobby-destination').textContent(),'Alps');assert.equal(await page.locator('#dictionary-count').textContent(),'0');
  await capture(page,'.lobby-panel','lobby-desktop');pass('大厅使用雪山原图、真实收词数及400/500/600字体，起始按钮可用');
  await page.locator('#activity-button').click();assert.equal(await page.locator('#activity-dialog').isVisible(),true);await capture(page,'#activity-dialog','calendar');await page.locator('#activity-close').click();
  await page.locator('#dictionary-button').click();assert.equal(await page.locator('#dictionary-dialog').isVisible(),true);await capture(page,'#dictionary-dialog','dictionary');await page.locator('#dictionary-close').click();
  await page.locator('#lobby-settings').click();assert.equal(await page.locator('#settings-popover').isVisible(),true);await page.locator('#settings-close').click();pass('词典、日历和画面设置保持原功能，弹窗使用冷色玻璃配色');
  await page.locator('#start-game').click();await page.locator('#manual-play-start').click();await fits(page);
  assert.match(await background(page,'.play-panel'),/bg-alps-level\.png/);assert.match(await background(page,'.tile'),/glass-tile\.png/);
  const answerStyle=await page.locator('.target-letter').first().evaluate(e=>({image:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).backgroundColor}));assert.equal(answerStyle.image,'none');assert.match(answerStyle.color,/rgba\(237, 246, 249, 0\.91\)/);
  assert.notEqual(await page.locator('.tile').first().evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  await capture(page,'#game-viewport','level-empty');
  const initial=await counts(page);await drag(page,[0]);assert.ok(await page.locator('.tile.invalid-word').count());assert.deepEqual(await counts(page),initial);await capture(page,'#game-viewport','level-error');
  const path=await hintPath(page),ps=await points(page,path);await page.mouse.move(ps[0].x,ps[0].y);await page.mouse.down();await page.mouse.move(ps[1].x,ps[1].y,{steps:3});
  assert.match(await background(page,'.tile.selected','::before'),/tile-selection\.png/);await page.locator('#game-viewport').screenshot({path:fileURLToPath(new URL('level-selected.png',qa))});
  for(const p of ps.slice(2))await page.mouse.move(p.x,p.y,{steps:3});await page.mouse.up();
  assert.equal(await page.locator('.target.completed').count(),1);const completedStyle=await page.locator('.target.completed .target-letter').first().evaluate(e=>({image:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).backgroundColor}));assert.equal(completedStyle.image,'none');assert.match(completedStyle.color,/rgba\(226, 236, 229/);assert.equal(initial.reduce((a,b)=>a+b,0)-(await counts(page)).reduce((a,b)=>a+b,0),path.length);
  await capture(page,'#game-viewport','level-desktop');await capture(page,'body','editor-desktop');pass('真实连线、玻璃选中态、错误态、完成答案和剩余次数均正确');
  await page.locator('#bonus-button').click();assert.equal(await page.locator('#bonus-dialog').isVisible(),true);await capture(page,'#bonus-dialog','bonus');await page.locator('#bonus-close').click();
  const targetTotal=await page.locator('.target').count();
  for(let i=1;i<targetTotal;i++)await drag(page,await hintPath(page));
  await page.locator('#level-complete-dialog').waitFor({state:'visible'});
  assert.ok((await counts(page)).every(n=>n===0));await capture(page,'#level-complete-dialog','completion');await page.locator('#complete-next').click();await page.waitForFunction(()=>document.querySelector('#manual-play-start')&&!document.querySelector('#manual-play-start').disabled);pass('通关后棋盘清空并进入真实下一关');
  await page.locator('#back-lobby').click();await page.locator('#dictionary-button').click();assert.ok(await page.locator('.dictionary-entry').count());await capture(page,'#dictionary-dialog','dictionary-filled');await page.locator('#dictionary-close').click();
  await page.locator('#start-game').click();
  for(const [width,height]of [[390,844],[360,640],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(120);await fits(page);await capture(page,'#game-viewport',`level-${width}x${height}`);}
  pass('390/360手机竖屏和844横屏布局无溢出，棋盘与控件不重叠');
  await page.setViewportSize({width:390,height:844});await page.locator('#back-lobby').click();await capture(page,'.lobby-panel','lobby-mobile');await context.close();
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(legacyRequests,[]);pass('零页面错误、零缺图、零旧巴黎资源及固定坐标贴片请求');
  const old=JSON.parse(await readFile(new URL('../dist/art/paris/manifest.json',import.meta.url),'utf8'));
  let oldBytes=0,newBytes=0;for(const a of old.assets)oldBytes+=(await stat(new URL('../dist/art/paris/'+a.path,import.meta.url))).size;for(const a of RUNTIME_ART)newBytes+=(await stat(new URL(a.path,pack))).size;
  await writeFile(new URL('results.json',qa),JSON.stringify({url,verifiedPackageFiles:verified,runtimeAssets:RUNTIME_ART.length,cases,errors,missing,legacyRequests,oldImageBytes:oldBytes,newImageBytes:newBytes,glassMode:'live backdrop filter + supplied RGBA skins'},null,2)+'\n');
  console.log(`TOTAL ${cases.length}/${cases.length}`);
}catch(error){console.error(error);throw error;}finally{await browser.close();}
