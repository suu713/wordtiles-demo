import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {ENCOURAGEMENT_CONFIG} from '../dist/core/encouragement-config.js';

const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fileURLToPath(new URL('../.openai/tmp/encouragement-policy/',import.meta.url));await mkdir(output,{recursive:true});
const floralOutput=fileURLToPath(new URL('../.openai/tmp/floral-finish-20261104/qa/',import.meta.url));await mkdir(floralOutput,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],measurements=[];
page.on('pageerror',error=>errors.push(error.message));
// Observe the real app callbacks without adding production debug hooks or changing its policy.
await page.route('**/encouragement-banners.js?*',async route=>{
  let source=await readFile(new URL('../dist/encouragement-banners.js',import.meta.url),'utf8');
  source=source.replace('this.progress=readProgress(storage,this.now());','this.now=()=>window.__qaRewardTime??Date.now();this.progress=readProgress(storage,this.now());');
  source=source.replace('this.banner=null;this.icon=null;','this.banner=null;this.icon=null;window.__qaRewards=this;this.__qaEvents=[];const originalShow=this.show;this.show=(...args)=>{this.__qaEvents.push({scene:args[0],text:args[2].text});return originalShow(...args);};');
  await route.fulfill({body:source,contentType:'text/javascript'});
});
// Isolate the known unrelated random startup exhaustion with the existing real seed-42 fixture.
await page.addInitScript(()=>{
  const Native=Worker;let first=true;
  window.Worker=class extends Native{
    constructor(url,options){super(url,options);this.generator=String(url).includes('/generator.worker.js');if(this.generator)this.addEventListener('message',({data})=>{if(data.result?.ok)window.__qaGeneratedLevel=data.result.level;});}
    postMessage(data,...rest){if(this.generator&&first){first=false;data={...data,seed:42,levelConfig:{rows:3,cols:3,wordLengths:[3,3,3,4,5],maxUses:3}};}return super.postMessage(data,...rest);}
  };
});
try{
  await page.goto(process.env.WORDTILES_URL||'http://127.0.0.1:4173/?theme=alps');
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled);await page.locator('#start-game').click();
  await page.waitForFunction(()=>!document.getElementById('hint').disabled&&!document.querySelector('.play-panel').classList.contains('level-entering'));await page.evaluate(()=>document.fonts.ready);
  const samples=Object.entries(ENCOURAGEMENT_CONFIG.scenes).flatMap(([scene,definition])=>definition.words.map(text=>({scene,text})));
  for(const width of [320,390,520]){
    await page.setViewportSize({width,height:Math.max(844,Math.ceil(width*16/9))});
    for(const sample of samples){
      const measured=await page.evaluate(({scene,text})=>{
        const rewards=window.__qaRewards;rewards.cancel();window.__qaRewardTime=(window.__qaRewardTime??Date.now())+10000;
        rewards.sync({status:'playing',initial:{targets:['CAT','DOG','OWL','FOX','ANT','BAT'].map(word=>({word}))},completed:new Set(),bonusCompleted:new Set()});
        const pool=rewards.config.scenes[scene].words.filter(word=>word!==rewards.progress.lastText);
        rewards.random=()=>(pool.indexOf(text)+.1)/pool.length;
        const result=rewards.present(scene),host=document.getElementById('encouragement-banner');
        for(const animation of host.getAnimations()){animation.pause();animation.currentTime=550;}
        const bounds=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {scene,text,result,actual:document.getElementById('encouragement-copy').textContent,
          safe:bounds(document.getElementById('encouragement-text')),copy:bounds(document.getElementById('encouragement-copy')),
          frame:bounds(host.querySelector(`[data-banner-frame="${host.dataset.frame}"]`))};
      },sample);
      assert.equal(measured.result.banner,true);assert.equal(measured.actual,sample.text);
      for(const edge of ['left','top'])assert.ok(measured.copy[edge]>=measured.safe[edge]-.7,JSON.stringify(measured));
      for(const edge of ['right','bottom'])assert.ok(measured.copy[edge]<=measured.safe[edge]+.7,JSON.stringify(measured));
      assert.ok(measured.copy.top>=measured.frame.top&&measured.copy.bottom<=measured.frame.top+measured.frame.height*.55,JSON.stringify(measured));
      measurements.push({width,...measured});
      if(sample.text==='Great!'||sample.text==="You've Got This!")await page.screenshot({path:output+`ribbon-${width}-${sample.scene}.png`});
    }
  }
  console.log(`PASS ${measurements.length} 个真实横幅布局：全部文案在320/390/520宽度完整居于正面安全区`);
  // Return the real reward controller to its actual game, then submit the actual generated paths.
  await page.evaluate(()=>{window.__qaRewards.cancel();window.__qaRewards.__qaEvents.length=0;});
  const level=await page.evaluate(()=>window.__qaGeneratedLevel);assert.ok(level?.targets);
  for(const target of level.targets){
    await page.evaluate(()=>{window.__qaRewardTime+=10000;});
    const path=target.canonicalPath||target.path;assert.ok(path?.length);
    for(const cell of path)await page.locator(`.tile[data-cell="${cell}"]`).press('Space');
    await page.locator(`.tile[data-cell="${path.at(-1)}"]`).press('Enter');
    await page.waitForFunction(word=>[...document.querySelectorAll('.target.completed')].some(target=>target.dataset.word===word),target.word);
    await page.waitForFunction(()=>!document.querySelector('.target-collecting'));
  }
  await page.locator('#completion-banner').waitFor({state:'visible'});
  assert.equal(await page.locator('#level-complete-dialog').isVisible(),false);assert.equal(await page.locator('.target.completed').count(),level.targets.length);assert.equal(await page.locator('.target-collecting').count(),0);
  assert.equal(await page.locator('#completion-banner .floral-bloom').count(),2);assert.equal(await page.locator('#completion-banner .floral-plate').count(),1);
  const finishVariant=await page.locator('#completion-banner .floral-banner').getAttribute('data-variant');
  await page.screenshot({path:floralOutput+'game-flowers-first.png'});await page.waitForTimeout(600);await page.screenshot({path:floralOutput+'game-floral-banner.png'});
  assert.equal(await page.locator('#level-complete-dialog').isVisible(),false);
  const finishTextFits=await page.locator('#completion-banner .floral-label').evaluate(label=>{const b=label.getBoundingClientRect(),r=label.firstElementChild.getBoundingClientRect();return r.left>=b.left-.5&&r.right<=b.right+.5&&r.top>=b.top-.5&&r.bottom<=b.bottom+.5;});assert.equal(finishTextFits,true);
  await page.locator('#level-complete-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#completion-banner').isVisible(),false);await page.waitForFunction(()=>document.querySelector('#level-complete-dialog').classList.contains('settlement-ready'));
  const events=await page.evaluate(()=>window.__qaRewards.__qaEvents);assert.ok(events.every(event=>!['ordinary','advanced','complete'].includes(event.scene)),JSON.stringify(events));
  assert.equal(await page.locator('#encouragement-banner').isVisible(),false);assert.equal(await page.locator('#encouragement-icon').isVisible(),false);
  await page.screenshot({path:output+'settlement.png'});await page.screenshot({path:floralOutput+'game-settlement.png'});console.log('PASS 真实五目标关卡按收词动画、花饰横幅、结算页依次播放，没有抢播或额外图标');
  assert.deepEqual(errors,[]);await writeFile(output+'results.json',JSON.stringify({measurements,events,finishVariant,errors},null,2));
}catch(error){await page.screenshot({path:output+'failure.png'});throw error;}finally{await browser.close();}
