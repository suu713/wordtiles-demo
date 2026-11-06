import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../.openai/tmp/floral-finish-20261104/qa/',import.meta.url));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1000,height:610}}),errors=[],missing=[];
page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
await page.route('**/__floral-art-qa.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/floral-banner.css"><style>@font-face{font-family:'WordTiles Tile';src:url('/art/alps/fonts/NunitoSans-Variable.ttf');font-weight:200 1000}*{box-sizing:border-box}body{margin:0;padding:20px;background:#edf1f2;font-family:sans-serif}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px}.sample{height:265px;container-type:inline-size;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(#716079aa,#a18572aa),url('/art/themes/desert.png') center 70%/cover;padding:14px;border-radius:12px}.sample h2{margin:0 0 25px;color:white;font-size:14px;font-weight:500}.host{width:100%}</style><div class="gallery"></div><script type="module">import{FLORAL_BANNERS,FloralBannerView,preloadFloralBanners}from'/floral-banner-art.js';await preloadFloralBanners();await document.fonts.ready;window.artViews=FLORAL_BANNERS.map(art=>{const sample=document.createElement('section');sample.className='sample';sample.innerHTML='<h2>'+art.id+'</h2><div class="host"></div>';document.querySelector('.gallery').append(sample);const view=new FloralBannerView(sample.querySelector('.host'));view.show(art,'One to Go!');view.element.classList.remove('floral-active');return view;});</script></html>`}));
try{
  await page.goto('http://127.0.0.1:4173/__floral-art-qa.html');await page.waitForFunction(()=>window.artViews?.length===4);
  await page.screenshot({path:out+'four-variants.png'});
  for(const view of await page.locator('.floral-banner').all()){
    assert.equal(await view.locator('.floral-plate').count(),1);assert.equal(await view.locator('.floral-bloom').count(),2);
    const fits=await view.evaluate(root=>{const b=root.querySelector('.floral-label').getBoundingClientRect(),r=root.querySelector('.floral-label>span').getBoundingClientRect();return r.left>=b.left-.5&&r.right<=b.right+.5&&r.top>=b.top-.5&&r.bottom<=b.bottom+.5;});assert.equal(fits,true);
  }
  await page.evaluate(()=>{for(const view of window.artViews){view.show(view.element.dataset.variant,"You've Got This!",2200);}});
  await page.waitForTimeout(140);await page.screenshot({path:out+'flowers-first.png'});
  await page.waitForTimeout(600);await page.screenshot({path:out+'plate-and-text.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await writeFile(out+'art-results.json',JSON.stringify({variants:4,errors,missing},null,2));console.log('PASS 四款原始切图分层、花饰先入场、文字边界和资源完整性');
}catch(error){await page.screenshot({path:out+'failure.png'});throw error;}finally{await browser.close();}
