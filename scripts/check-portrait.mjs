import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
let chromium;
try { ({ chromium }=require('playwright')); }
catch { ({ chromium }=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let browser;
try { browser=await chromium.launch({ headless:true,channel:'chrome' }); }
catch { browser=await chromium.launch({ headless:true,channel:'msedge' }); }
const bank=JSON.parse(await readFile(new URL('../dist/source-levels/spanish.json',import.meta.url),'utf8'));
const results=[];
try {
  for (const width of [320,360,390,1440]) {
    const context=await browser.newContext({ viewport:{ width,height:width===1440?1000:844 },reducedMotion:'reduce' });
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.locator('#validation-badge').filter({ hasText:'需求不变量通过' }).waitFor();
    await page.locator('#source-language').selectOption('spanish');
    await page.locator('#source-order').selectOption('all');
    await page.locator('#source-number').fill('1221');
    await page.locator('#source-load').click();
    await page.waitForFunction(()=>document.querySelector('#active-seed').textContent==='14155');
    await page.waitForTimeout(100);
    const metrics=await page.evaluate(() => {
      const viewport=document.querySelector('#game-viewport').getBoundingClientRect(),board=document.querySelector('#board').getBoundingClientRect(),actions=document.querySelector('.play-actions').getBoundingClientRect();
      return { ratio:viewport.width/viewport.height,width:viewport.width,height:viewport.height,tile:document.querySelector('.tile').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>window.innerWidth,fits:board.top>=viewport.top && board.bottom<=viewport.bottom+1 && actions.bottom<=viewport.bottom+1,countOverlap:[...document.querySelectorAll('.many-uses')].some(tile=>{
        const letter=tile.querySelector('.tile-letter').getBoundingClientRect(),badge=tile.querySelector('.count-badge').getBoundingClientRect();
        return letter.left<badge.right && letter.right>badge.left && letter.top<badge.bottom && letter.bottom>badge.top;
      }),scrollHint:!document.querySelector('#targets-note').hidden,targetOverflow:document.querySelector('#targets').scrollHeight>document.querySelector('#targets').clientHeight+1 };
    });
    await page.screenshot({ path:fileURLToPath(new URL('../reports/portrait-'+width+'.png',import.meta.url)),fullPage:true });
    console.log(JSON.stringify({ screenWidth:width,...metrics }));
    assert.ok(Math.abs(metrics.ratio-9/16)<.001);
    assert.equal(metrics.overflow,false); assert.equal(metrics.fits,true);
    assert.ok(metrics.tile>=30); assert.equal(metrics.countOverlap,false);
    assert.equal(metrics.scrollHint,metrics.targetOverflow);
    assert.equal(bank.levels[14155].target_words.length,18);
    results.push({ screenWidth:width,...metrics });
    await context.close();
  }
  await writeFile(new URL('../reports/portrait.json',import.meta.url),JSON.stringify({ passed:results.length,results },null,2)+'\n');
} finally { await browser.close(); }
