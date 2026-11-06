import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {CHECKIN_KEY} from '../dist/core/daily-checkin.js';
const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../.openai/tmp/checkin-20261104/qa-v3/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],missing=[],checks=[];
const url=process.env.WORDTILES_URL||'http://127.0.0.1:4173/?theme=alps&checkin=3';
function pass(message){checks.push(message);console.log('PASS '+message);}
async function tab({days=[],reducedMotion='no-preference'}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',reducedMotion});
  await context.addInitScript(({key,days})=>{
    if(!sessionStorage.getItem('checkin-qa-initialized')){sessionStorage.setItem('checkin-qa-initialized','1');if(days.length)localStorage.setItem(key,JSON.stringify({version:1,days}));}
    // Real deterministic startup fixture only; check-in randomness and calendar state are untouched.
    const Native=Worker;let first=true;window.Worker=class extends Native{constructor(url,options){super(url,options);this.generator=String(url).includes('/generator.worker.js');}postMessage(data,...rest){if(first&&this.generator){first=false;data={...data,seed:42,levelConfig:{rows:3,cols:3,wordLengths:[3,3,3,4,5],maxUses:3}};}return super.postMessage(data,...rest);}};
  },{key:CHECKIN_KEY,days});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
  await page.clock.install({time:new Date('2026-11-03T12:00:00+08:00')});
  await page.goto(url);await page.waitForFunction(()=>!document.getElementById('start-game').disabled);await page.evaluate(()=>document.fonts.ready);
  return {context,page};
}
const phase=async(page,value)=>page.waitForFunction(value=>document.querySelector('.checkin-stage').dataset.phase===value,value);
const data=page=>page.evaluate(key=>localStorage.getItem(key),CHECKIN_KEY);
let page;
try{
  let context;({context,page}=await tab({days:['2026-11-02']}));
  const entry=await page.locator('#lobby-checkin').boundingBox(),start=await page.locator('#start-game').boundingBox();assert.ok(entry.y+entry.height<start.y);
  await page.screenshot({path:out+'lobby.png'});await page.locator('#lobby-checkin').click();await phase(page,'unlit');
  await page.locator('#checkin-dialog').screenshot({path:out+'unlit.png'});assert.equal(await data(page),JSON.stringify({version:1,days:['2026-11-02']}));
  pass('大厅入口在开始按钮上方，未点亮界面使用原始羽毛、星光和阴影切图');
  await page.evaluate(()=>{window.checkinSwayBefore={quill:document.querySelector('.checkin-feather-sway').getAnimations()[0],book:document.querySelector('.checkin-book-sway').getAnimations()[0]};});
  // Two immediate user activations must still create only one local check-in.
  await page.locator('#checkin-light').evaluate(button=>{button.click();button.click();});await phase(page,'lighting');
  assert.equal(await page.evaluate(()=>document.querySelector('.checkin-feather-sway').getAnimations().includes(window.checkinSwayBefore.quill)&&document.querySelector('.checkin-book-sway').getAnimations().includes(window.checkinSwayBefore.book)),true);
  await page.waitForTimeout(520);await page.locator('#checkin-dialog').screenshot({path:out+'lighting-feather.png'});
  await page.waitForTimeout(1850);await page.locator('#checkin-dialog').screenshot({path:out+'lighting-week.png'});
  await phase(page,'lit');assert.equal(await page.locator('#checkin-streak-number').innerText(),'2');assert.equal(await page.locator('#checkin-week [data-signed="true"]').count(),1);
  assert.equal(await page.locator('#checkin-week li').first().getAttribute('data-today'),'true');assert.equal(await page.locator('#checkin-week').getAttribute('data-order'),'today-first');
  assert.equal(await page.evaluate(()=>document.querySelector('.checkin-feather-sway').getAnimations().includes(window.checkinSwayBefore.quill)&&document.querySelector('.checkin-book-sway').getAnimations().includes(window.checkinSwayBefore.book)),true);
  assert.equal(await page.locator('#checkin-week [data-today="true"]').getAttribute('data-signed'),'true');
  const saved=await data(page);assert.deepEqual(JSON.parse(saved).days,['2026-11-02','2026-11-03']);await page.locator('#checkin-dialog').screenshot({path:out+'lit.png'});
  pass('羽毛轻晃蓄光、染色移位与书本显现衔接；轻晃贯穿状态切换，重复点击只签到一次');
  pass('未满七天从今天开始顺排，没有今天前的空位，历史连续签到数保留');
  await page.locator('#checkin-replay').click();await phase(page,'lighting');await page.locator('#checkin-close').click();
  await page.locator('#lobby-checkin').click();await phase(page,'lit');assert.equal(await data(page),saved);await page.locator('#checkin-replay').click();await phase(page,'lighting');
  // Sample actual rendered geometry while the book is appearing: the route layer
  // must have arrived already. Idle sway lives in its separate, continuous child.
  const heldPoses=await page.evaluate(()=>{
    const stage=document.querySelector('.checkin-stage'),quill=stage.querySelector('.checkin-feather'),book=stage.querySelector('.checkin-book-anchor');
    const opening=book.getAnimations().find(animation=>animation.animationName==='checkin-book-open'),timing=opening.effect.getTiming();
    const finite=stage.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().iterations!==Infinity);finite.forEach(animation=>animation.pause());
    return [.1,.4,.8,1].map(fraction=>{
      const ms=Number(timing.delay)+Number(timing.duration)*fraction;finite.forEach(animation=>animation.currentTime=ms);
      const rect=quill.getBoundingClientRect();return {ms,x:rect.x,y:rect.y,width:rect.width,height:rect.height,bookOpacity:Number(getComputedStyle(book).opacity)};
    });
  });
  for(const pose of heldPoses){assert.ok(pose.bookOpacity>.02);for(const key of ['x','y','width','height'])assert.ok(Math.abs(pose[key]-heldPoses[0][key])<.05,JSON.stringify(heldPoses));}
  await page.locator('#checkin-dialog').screenshot({path:out+'book-appeared-quill-held.png'});
  await phase(page,'lit');const finalPose=await page.locator('.checkin-feather').boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(finalPose[key]-heldPoses[0][key])<.05,JSON.stringify({heldPoses,finalPose}));
  assert.equal(await data(page),saved);await writeFile(out+'book-handoff.json',JSON.stringify({heldPoses,finalPose},null,2));
  pass('书本显现期间笔的位置和大小保持不变，转入完成态也没有第二次位移');
  pass('已签到直接进入完成页，重播和中途退出都不增加天数，不遗留动画锁');
  for(const [width,height]of [[320,568],[390,844],[1440,1000]]){
    await page.setViewportSize({width,height});
    const fits=await page.locator('#checkin-dialog').evaluate(dialog=>{const r=dialog.getBoundingClientRect(),button=dialog.querySelector('#checkin-play').getBoundingClientRect();return r.width>0&&Math.abs(r.width/r.height-9/16)<.01&&r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5&&button.bottom<r.bottom&&dialog.scrollWidth<=dialog.clientWidth;});
    assert.ok(fits);await page.locator('#checkin-dialog').screenshot({path:out+`lit-${width}.png`});
  }
  pass('320、390和桌面窗口均保持9:16，周记录与按钮不溢出');
  await page.locator('#checkin-play').click();await page.waitForFunction(()=>document.getElementById('lobby').hidden&&!document.getElementById('game-screen').hidden);assert.equal(await page.locator('#checkin-dialog').isVisible(),false);
  await page.locator('#back-lobby').click();await page.reload();await page.waitForFunction(()=>!document.getElementById('start-game').disabled);await page.locator('#lobby-checkin').click();await phase(page,'lit');assert.equal(await data(page),saved);
  pass('Play Now进入当前真实关卡，返回大厅和刷新后保留签到');
  await page.locator('#checkin-close').click();await page.locator('#lobby-settings').click();await Promise.all([page.waitForNavigation(),page.locator('#clear-all-data').click()]);await page.waitForFunction(()=>!document.getElementById('start-game').disabled);assert.equal(await data(page),null);await page.locator('#lobby-checkin').click();await phase(page,'unlit');
  pass('设置中的清除所有数据同时清除签到记录');await context.close();
  ({context,page}=await tab({reducedMotion:'reduce'}));await page.locator('#lobby-checkin').click();await page.locator('#checkin-light').click();await phase(page,'lit');assert.equal(await page.locator('#checkin-streak-number').innerText(),'1');assert.equal(await page.locator('#checkin-play').isEnabled(),true);await page.locator('#checkin-dialog').screenshot({path:out+'reduced-motion.png'});await context.close();
  pass('减弱动态立即呈现完成页，按钮可用，不等待动效计时');
  ({context,page}=await tab());await page.clock.setSystemTime(new Date('2026-11-03T23:59:59.500+08:00'));await page.locator('#lobby-checkin').click();await page.locator('#checkin-light').click();await phase(page,'lighting');await page.clock.fastForward(4000);await phase(page,'unlit');
  assert.deepEqual(JSON.parse(await data(page)).days,['2026-11-03']);assert.equal(await page.locator('#checkin-light').isEnabled(),true);await page.locator('#checkin-light').click();await page.clock.fastForward(4000);await phase(page,'lit');assert.equal(await page.locator('#checkin-streak-number').innerText(),'2');await context.close();
  pass('点亮过程中跨过午夜会进入新一天的未点亮态，可继续签到且不重复记录');
  ({context,page}=await tab({days:['2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02'],reducedMotion:'reduce'}));await page.locator('#lobby-checkin').click();await page.locator('#checkin-light').click();await phase(page,'lit');
  assert.equal(await page.locator('#checkin-week').getAttribute('data-order'),'calendar');
  assert.deepEqual(await page.locator('.checkin-weekday').allTextContents(),['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);assert.equal(await page.locator('#checkin-week li').nth(1).getAttribute('data-today'),'true');
  await page.locator('#checkin-dialog').screenshot({path:out+'seventh-checkin-calendar.png'});await context.close();
  pass('第七次签到即时切换为周一至周日自然周，今天与真实记录对应');
  const manifest=JSON.parse(await readFile(new URL('../dist/art/checkin/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.assets.length,19);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await writeFile(out+'results.json',JSON.stringify({checks,errors,missing},null,2));console.log(`TOTAL ${checks.length}/${checks.length}`);
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:out+'failure.png'});throw error;}finally{await browser.close();}
