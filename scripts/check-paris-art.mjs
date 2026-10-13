import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const manifest=await json('../dist/art/paris/manifest.json');
const fixture=await json('../examples/tsv/seed_20261010.json');
const reportDirectory=fileURLToPath(new URL(process.env.ART_REPORT_DIR||'../reports/',import.meta.url));
await mkdir(reportDirectory,{recursive:true});
const baseURL=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?v=14';
const cases=[],pageErrors=[],assetErrors=[];
const pass=name=>{cases.push({name,passed:true});console.log('PASS '+name);};
for(const entry of [...manifest.assets,...manifest.fonts]){
  const bytes=await readFile(new URL('../dist/art/paris/'+entry.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'原始素材必须逐字节保留：'+entry.path);
}
pass('18个素材与3个字体的原始哈希一致，字体许可保留');
assert.match(await readFile(new URL('../dist/art/paris/fonts/OFL.txt',import.meta.url),'utf8'),/SIL OPEN FONT LICENSE/);
if(process.argv.includes('--assets-only'))process.exit(0);
const require=createRequire(import.meta.url);
let chromium;
try {({chromium}=require('playwright'));}
catch {({chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const browser=await chromium.launch({headless:true,channel:'chrome'});
const screenshot=async(page,name)=>page.screenshot({path:reportDirectory+'/'+name+'.png',fullPage:true});
async function geometry(page,path){return Promise.all(path.map(async cell=>{const r=await page.locator('[data-cell="'+cell+'"]').boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};}));}
async function drag(page,path,touch=false){
  const points=await geometry(page,path);
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});for(const point of points.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else {await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const point of points.slice(1))await page.mouse.move(point.x,point.y);await page.mouse.up();}
}
const counts=page=>page.locator('.tile').evaluateAll(items=>items.map(el=>Number(el.dataset.remaining)));
const background=(page,selector,pseudo=null)=>page.locator(selector).first().evaluate((el,pseudo)=>getComputedStyle(el,pseudo).backgroundImage,pseudo);
async function fits(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);}
try {
  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await context.newPage(),loaded=new Set();
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.includes('/art/paris/')){if(response.status()>=400)assetErrors.push(path+':'+response.status());else loaded.add(path.split('/art/paris/')[1]);}});
  await page.goto(baseURL);await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
  assert.equal(await page.locator('#lobby').isVisible(),true);
  assert.match(await background(page,'.lobby-panel'),/bg-paris-lobby\.png/);
  for(const entry of manifest.assets)assert.ok(loaded.has(entry.path),'素材没有成功加载：'+entry.path);
  for(const weight of [400,700,900])assert.equal(await page.evaluate(weight=>document.fonts.check(weight+' 20px "Nunito Sans"'),weight),true);
  await screenshot(page,'paris-lobby-desktop');pass('大厅、全部18素材、字体在首个可玩画面前加载');
  await page.locator('#lobby-settings').click();assert.equal(await page.locator('#settings-popover').isVisible(),true);await page.locator('#preview-device').selectOption('360x640');await page.locator('#preview-device').selectOption('auto');await page.locator('#settings-close').click();assert.equal(await page.locator('#game-screen').isVisible(),false);
  await page.locator('#activity-button').click();assert.equal(await page.locator('#activity-empty').isVisible(),true);await page.locator('#activity-close').click();pass('大厅设置与空日历可用，点击开始之前仍在大厅');
  await page.locator('#start-game').click();assert.match(await background(page,'.play-panel'),/bg-paris-level\.png/);assert.match(await background(page,'.tile'),/tile-letter\.png/);assert.match(await background(page,'.target-letter'),/tile-answer-empty\.png/);assert.deepEqual(await counts(page),fixture.initialCounts);
  await page.locator('#hint').click();assert.equal(await page.locator('#hint-remaining').textContent(),'5');assert.ok(await page.locator('.hint-arrow').count()>0);await screenshot(page,'paris-level-hint');
  await page.locator('[data-cell="0"]').press('Escape');
  const points=await geometry(page,fixture.targets[0].canonicalPath);await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y);assert.match(await background(page,'.tile.selected','::before'),/tile-selection\.png/);await screenshot(page,'paris-level-selected');await page.mouse.move(points[2].x,points[2].y);await page.mouse.up();
  assert.equal(await page.locator('.target.completed').count(),1);assert.match(await background(page,'.target.completed .target-letter'),/tile-answer-filled\.png/);assert.equal(await page.locator('#hint-remaining').textContent(),'4');await screenshot(page,'paris-level-desktop');pass('原始字母格、选中覆盖、空答案、完成答案、提示方向和动态角标');
  const before=await counts(page);await drag(page,[0,3,6]);assert.equal(await page.locator('.tile.invalid-word').count(),3);assert.deepEqual(await counts(page),before);
  await drag(page,[0,1,4,5]);assert.deepEqual(await counts(page),before);assert.equal(await page.locator('#bonus-count').textContent(),'1');assert.equal(await page.locator('#game-collection-count').textContent(),'2');
  await page.locator('#back-lobby').click();assert.equal(await page.locator('#dictionary-count').textContent(),'2');assert.equal(await page.locator('.progress-dot.active').count(),1);assert.equal(await page.locator('#lobby-progress-label').textContent(),'1 / 5');assert.match(await background(page,'.progress-dot.active'),/progress-active\.png/);assert.match(await background(page,'.progress-dot:not(.active)'),/progress-empty\.png/);
  await page.locator('#activity-button').click();assert.deepEqual((await page.locator('.activity-words span').allTextContents()).sort(),['FOR','FORT']);assert.match(await page.locator('.activity-day h3').textContent(),/^\d{4}-\d{2}-\d{2}$/);await screenshot(page,'paris-activity');await page.locator('#activity-close').click();
  await page.locator('#dictionary-button').click();assert.equal(await page.locator('.dictionary-entry').count(),2);await page.locator('#dictionary-close').click();await page.reload();await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);assert.equal(await page.locator('#dictionary-count').textContent(),'2');pass('错误变红、额外词不扣次数、金币位真实收词数、进度点和日历持久记录');
  await page.locator('#start-game').click();await page.locator('#new-level').click();await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({state:'attached'});assert.match(await page.locator('#validation-badge').textContent(),/32 \/ 32/);assert.equal(await page.locator('.target').count(),5);assert.equal(await page.locator('#dictionary-count').textContent(),'2');pass('换关图标使用原生成器与完整校验，保留词典');await context.close();
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'}),mobile=await mobileContext.newPage();mobile.on('pageerror',error=>pageErrors.push(error.message));await mobile.goto(baseURL);await mobile.waitForFunction(()=>!document.querySelector('#start-game').disabled);await fits(mobile);await screenshot(mobile,'paris-lobby-mobile');await mobile.locator('#start-game').click();
  await drag(mobile,fixture.targets[0].canonicalPath,true);assert.equal(await mobile.locator('.target.completed').count(),1);await fits(mobile);await screenshot(mobile,'paris-level-mobile');
  for(const target of fixture.targets.slice(1))await drag(mobile,target.canonicalPath,true);assert.deepEqual(await counts(mobile),Array(9).fill(0));assert.equal(await mobile.locator('#win-banner').isVisible(),true);await fits(mobile);await screenshot(mobile,'paris-level-completed');await mobile.locator('#back-lobby').click();assert.equal(await mobile.locator('#dictionary-count').textContent(),'5');assert.equal(await mobile.locator('.progress-dot.active').count(),5);await mobile.locator('#dictionary-button').click();assert.equal(await mobile.locator('.dictionary-entry').count(),5);await screenshot(mobile,'paris-dictionary-mobile');await mobileContext.close();pass('手机真实触摸、通关、返回大厅和词典全部适配');
  assert.deepEqual(pageErrors,[]);assert.deepEqual(assetErrors,[]);
  await writeFile(reportDirectory+'/paris-art-browser.json',JSON.stringify({url:baseURL,artFiles:manifest.assets.length,fontFiles:manifest.fonts.length,hashesMatch:true,passed:cases.length,pageErrors,assetErrors,cases},null,2)+'\n');console.log('TOTAL '+cases.length+'/'+cases.length+', page errors: '+pageErrors.length);
}finally{await browser.close();}
