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
  for (const [width,height] of [[1680,900],[1366,768],[1280,720],[1024,600],[768,650],[390,844],[360,640],[320,568]]) {
    const context=await browser.newContext({ viewport:{ width,height },reducedMotion:'reduce' });
    const page=await context.newPage();
    await page.goto(process.env.WORDTILES_URL || 'http://127.0.0.1:4173/?v=15');
    await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
    assert.equal(await page.locator('.lobby-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth}),true);
    await page.locator('#start-game').click();
    assert.equal(await page.locator('#settings-popover').isVisible(),false);
    assert.equal(await page.locator('#hover-help').isVisible(),false);
    if(width<=760) { assert.equal(await page.locator('.editor-panel').isVisible(),false); await page.locator('#editor-toggle').click(); }
    await page.locator('#algorithm').selectOption('1');
    await page.locator('#validation-badge').filter({hasText:'需求不变量通过'}).waitFor({state:'attached'});
    if(width<=760&&!await page.locator('.editor-panel').isVisible()) await page.locator('#editor-toggle').click();
    await page.locator('#source-language').selectOption('spanish');
    await page.locator('#source-order').selectOption('all');
    await page.locator('#source-number').selectOption('1221');
    await page.locator('#source-load').click();
    await page.waitForFunction(()=>document.querySelector('#active-seed').textContent==='14155');
    await page.waitForTimeout(100);
    const metrics=await page.evaluate(() => {
      const viewport=document.querySelector('#game-viewport').getBoundingClientRect(),board=document.querySelector('#board').getBoundingClientRect(),actions=document.querySelector('.play-actions').getBoundingClientRect();
      return { ratio:viewport.width/viewport.height,width:viewport.width,height:viewport.height,tile:document.querySelector('.tile').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>window.innerWidth || document.documentElement.scrollHeight>window.innerHeight,fits:viewport.top>=0 && viewport.bottom<=innerHeight+1 && viewport.left>=0 && viewport.right<=innerWidth+1 && board.top>=viewport.top && board.bottom<=viewport.bottom+1 && actions.bottom<=viewport.bottom+1,countOverlap:[...document.querySelectorAll('.tile:not(.empty)')].some(tile=>{
        const letter=tile.querySelector('.tile-letter').getBoundingClientRect(),badge=tile.querySelector('.count-badge').getBoundingClientRect();
        return letter.left<badge.right && letter.right>badge.left && letter.top<badge.bottom && letter.bottom>badge.top;
      }),scrollHint:!document.querySelector('#targets-note').hidden,targetOverflow:document.querySelector('#targets').scrollHeight>document.querySelector('#targets').clientHeight+1 };
    });
    await page.screenshot({ path:fileURLToPath(new URL('../reports/portrait-'+width+'.png',import.meta.url)),fullPage:true });
    console.log(JSON.stringify({ screenWidth:width,screenHeight:height,...metrics }));
    assert.ok(Math.abs(metrics.ratio-9/16)<.001);
    assert.equal(metrics.overflow,false); assert.equal(metrics.fits,true);
    assert.ok(metrics.tile>=30); assert.equal(metrics.countOverlap,false);
    assert.equal(metrics.scrollHint,metrics.targetOverflow);
    assert.equal(bank.levels[14155].target_words.length,18);
    if(width<=760) await page.locator('#editor-toggle').click();
    const editorFit = await page.locator('.editor-panel').evaluate(el => {
      const rect = el.getBoundingClientRect(), stats = document.querySelector('#level-statistics').getBoundingClientRect();
      return { fits: el.scrollHeight <= el.clientHeight + 1, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, statsVisible: stats.top >= rect.top && stats.bottom <= rect.bottom, inScreen: rect.top >= 0 && rect.bottom <= innerHeight + 1 };
    });
    console.log(JSON.stringify({ screenWidth: width, editorFit }));
    assert.equal(editorFit.fits, true); assert.equal(editorFit.statsVisible, true); assert.equal(editorFit.inScreen, true);
    await page.locator('#options-menu').selectOption('board');
    assert.equal(await page.locator('#target-length-list option').count(),18);
    assert.equal(await page.locator('#word-lengths select').count(),1);
    assert.equal(await page.locator('#source-number').evaluate(el=>el.tagName),'SELECT');
    await page.locator('#options-menu').selectOption('debug');
    assert.equal(await page.locator('#settings-popover').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;}),true);
    await page.locator('#settings-close').click();
    if(width<=760) await page.locator('#editor-close').click();
    await page.locator('#rules-button').hover();
    assert.equal(await page.locator('#hover-help').isVisible(),true);
    assert.equal(await page.locator('#hover-help').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;}),true);
    await page.mouse.move(0,0);
    assert.equal(await page.locator('#hover-help').isVisible(),false);
    if(width<=760) await page.locator('#editor-toggle').click();
    await page.locator('#algorithm').selectOption('2');
    await page.locator('#dictionary-source').selectOption('graded');
    await page.locator('#lexicon-status').filter({hasText:'游戏词库 7,618'}).waitFor({state:'attached'});
    await page.locator('#options-menu').selectOption('lexicon');
    assert.equal(await page.locator('#unreviewed-mode').count(),0);
    await page.waitForFunction(()=>!document.querySelector('#generate-seed').disabled);
    await page.locator('#settings-close').click();
    await page.locator('#seed').fill('0'); await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({state:'attached'});
    await page.waitForTimeout(100);
    const graded = await page.evaluate(() => {
      const viewport=document.querySelector('#game-viewport').getBoundingClientRect(),board=document.querySelector('#board').getBoundingClientRect(),actions=document.querySelector('.play-actions').getBoundingClientRect();
      return { overflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight, fits:viewport.top>=0 && viewport.bottom<=innerHeight+1 && board.top>=viewport.top && board.bottom<=viewport.bottom+1 && actions.bottom<=viewport.bottom+1,cleanTitle:document.querySelector('.game-title-row').innerText==='Word Tile',warning:document.querySelector('#level-kind').textContent };
    });
    assert.equal(graded.overflow,false); assert.equal(graded.fits,true); assert.equal(graded.cleanTitle,true);
    assert.equal(graded.warning,'自动生成');
    await page.screenshot({path:fileURLToPath(new URL('../reports/portrait-graded-'+width+'.png',import.meta.url)),fullPage:true});
    if(width<=760) await page.locator('#editor-toggle').click();
    graded.editorFits = await page.locator('.editor-panel').evaluate(el=>el.scrollHeight<=el.clientHeight+1 && document.querySelector('#level-statistics').getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom);
    console.log(JSON.stringify({screenWidth:width,graded}));
    assert.equal(graded.editorFits,true);
    if(width===320) { await page.mouse.move(0,0); await page.screenshot({path:fileURLToPath(new URL('../reports/lexicon-editor-mobile.png',import.meta.url)),fullPage:true}); }
    results.push({ screenWidth:width,screenHeight:height,...metrics,editorFit,graded });
    await context.close();
  }
  await writeFile(new URL('../reports/portrait.json',import.meta.url),JSON.stringify({ passed:results.length,results },null,2)+'\n');
} finally { await browser.close(); }
