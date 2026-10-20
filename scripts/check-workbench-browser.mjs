import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fileURLToPath(new URL('../.openai/tmp/workbench/qa/',import.meta.url));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],checks=[],page=await browser.newPage({viewport:{width:1900,height:950}});
page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
try{
  await page.goto(process.env.WORDTILES_URL||'http://127.0.0.1:4173/');
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled&&!document.getElementById('batch-run').disabled);
  assert.equal(await page.locator('#start-game').isEnabled(),true);
  assert.equal(await page.locator('html').getAttribute('data-art-ready'),'true');
  await page.locator('#start-game').click();
  assert.deepEqual(await page.locator('#play-source option').evaluateAll(options=>options.map(option=>option.value)),['web','wordtiles']);
  assert.deepEqual(await page.locator('#batch-game option').evaluateAll(options=>options.map(option=>option.value)),['wordtiles','web']);
  assert.equal(await page.locator('#dictionary-source option').evaluateAll(options=>options.map(option=>option.value)).then(values=>values.includes('zen')),false);
  assert.equal(await page.locator('#zen-dictionary-field').isVisible(),false);
  await page.screenshot({path:output+'code-only-workbench.png'});
  pass('网页启动、Alps资源预载、WT/网页生成入口可用，Zen数据入口隐藏');
  await page.locator('[data-lab-tab="simulate"]').click();
  assert.equal(await page.locator('#sim-start').isEnabled(),true);
  await page.locator('[data-lab-tab="batch"]').click();
  assert.equal(await page.locator('#batch-run').isEnabled(),true);
  await page.locator('#batch-game').selectOption('wordtiles');await page.locator('#batch-bank').selectOption('main');
  await page.locator('#batch-mode').selectOption('ordinary');await page.locator('#batch-start').fill('1');await page.locator('#batch-end').fill('1');await page.locator('#batch-repeats').fill('1');
  await page.locator('#batch-run').click();await page.waitForFunction(()=>!document.getElementById('batch-json').disabled,{timeout:30000});
  assert.equal(await page.locator('#batch-results tr').count(),1);assert.match(await page.locator('#batch-status').innerText(),/反跑完成/);
  pass('模拟试玩与单关反跑工作区使用可用数据启动，Worker无需缺失词频文件');
  assert.deepEqual(errors,[]);await writeFile(output+'browser-results.json',JSON.stringify({checks,errors},null,2));
}catch(error){await page.screenshot({path:output+'failure.png'});throw error;}finally{await browser.close();}
