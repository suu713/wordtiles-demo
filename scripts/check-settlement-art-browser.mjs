import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../.openai/tmp/settlement-book-20261104/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],missing=[],samples=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
// Use the existing fixture only in this isolated browser; production remains random.
await page.addInitScript(()=>{
  const Native=Worker;let first=true;
  window.Worker=class extends Native{constructor(url,options){super(url,options);this.generator=String(url).includes('/generator.worker.js');}
    postMessage(data,...rest){if(this.generator&&first){first=false;data={...data,seed:42,levelConfig:{rows:3,cols:3,wordLengths:[3,3,3,4,5],maxUses:3}};}return super.postMessage(data,...rest);}};
});
const open=()=>page.evaluate(async()=>{const dialog=document.getElementById('level-complete-dialog');if(dialog.open){dialog.close();void dialog.offsetWidth;await new Promise(requestAnimationFrame);}dialog.showModal();});
const sample=async time=>{
  const state=await page.locator('#level-complete-dialog').evaluate((dialog,time)=>{
    for(const animation of dialog.getAnimations({subtree:true})){animation.pause();animation.currentTime=time;}
    const styles=selector=>{const style=getComputedStyle(dialog.querySelector(selector));return {opacity:Number(style.opacity),transform:style.transform};};
    return {time,point:styles('.settlement-book-point'),book:styles('.settlement-book-page'),glint:styles('.settlement-book-glint')};
  },time);
  await page.screenshot({path:out+`motion-${time}.png`});samples.push(state);return state;
};
try{
  await page.goto(process.env.WORDTILES_URL||'http://127.0.0.1:4173/?theme=alps');
  await page.locator('#level-complete-dialog').waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled);
  await page.evaluate(async()=>{await Promise.all(['./art/settlement/reference.png','./art/settlement/foreground.png','./art/settlement/golden-book/book@2x.png'].map(async src=>{const image=new Image();image.src=src;await image.decode();}));await document.fonts.ready;});
  await open();
  const initial=await sample(0);assert.equal(initial.book.opacity,0);
  const point=await sample(100);assert.ok(point.point.opacity>.5);assert.equal(point.book.opacity,0);
  const unfold=await sample(350);assert.ok(unfold.book.opacity>.8);assert.notEqual(unfold.book.transform,'matrix(1, 0, 0, 1, 0, 0)');
  await sample(620);
  const opening=await sample(850);assert.notEqual(opening.book.transform,'matrix(1, 0, 0, 1, 0, 0)');assert.ok(opening.glint.opacity>0);
  const settled=await sample(1230);assert.equal(settled.book.opacity,1);assert.equal(settled.book.transform,'matrix(1, 0, 0, 1, 0, 0)');assert.equal(settled.point.opacity,0);assert.equal(settled.glint.opacity,0);
  await sample(1800);
  await page.screenshot({path:out+'settlement-layered.png'});
  // Compare the assembled resting symbol with the unchanged PNG at identical coordinates.
  await page.evaluate(()=>{const book=document.querySelector('.settlement-book');for(const child of book.children)if(child.tagName!=='defs')child.style.display='none';const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('href','./art/settlement/golden-book/book@2x.png');image.setAttribute('width','1454');image.setAttribute('height','596');image.id='qa-original-book';book.append(image);});
  await page.screenshot({path:out+'settlement-original.png'});
  await page.evaluate(()=>{document.getElementById('qa-original-book').remove();for(const child of document.querySelector('.settlement-book').children)child.style.display='';});
  for(const width of [320,390,520]){
    await page.setViewportSize({width,height:Math.max(640,Math.ceil(width*16/9))});
    const layout=await page.locator('#level-complete-dialog').evaluate(dialog=>{const box=selector=>{const r=dialog.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};const titleY=Number(dialog.querySelector('#settlement-title-clip rect').getAttribute('y')),titleTop=new DOMPoint(0,titleY).matrixTransform(dialog.querySelector('.settlement-title').getScreenCTM()).y;return {book:box('.settlement-book'),title:{top:titleTop},buttons:box('.settlement-buttons'),dialog:dialog.getBoundingClientRect().toJSON()};});
    assert.ok(layout.book.left>=layout.dialog.left&&layout.book.right<=layout.dialog.right);assert.ok(layout.book.bottom<=layout.title.top+1);assert.ok(layout.buttons.bottom<=layout.dialog.bottom);await page.screenshot({path:out+`settlement-${width}.png`});
  }
  // Closing and reopening restarts CSS effects, without altering player progress.
  await open();await page.waitForTimeout(50);
  const restarted=await page.locator('.settlement-book-page').evaluate(el=>Number(getComputedStyle(el).opacity));assert.equal(restarted,0);
  await page.waitForFunction(()=>document.getElementById('level-complete-dialog').classList.contains('settlement-ready'));
  assert.equal(await page.locator('.settlement-buttons').evaluate(el=>el.inert),false);
  await page.emulateMedia({reducedMotion:'reduce'});await open();
  const reduced=await page.locator('.settlement-book').evaluate(book=>({animations:book.getAnimations({subtree:true}).length,opacity:getComputedStyle(book.querySelector('.settlement-book-page')).opacity,point:getComputedStyle(book.querySelector('.settlement-book-point')).display}));
  assert.deepEqual(reduced,{animations:0,opacity:'1',point:'none'});await page.screenshot({path:out+'reduced-motion.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await writeFile(out+'results.json',JSON.stringify({samples,reduced,errors,missing},null,2));
  console.log('PASS 光点、900ms展开、柔光延后、1230ms定格，320/390/520宽度，重新打开与减少动态效果；按钮正常解锁');
}catch(error){await page.screenshot({path:out+'failure.png'});throw error;}finally{await browser.close();}
