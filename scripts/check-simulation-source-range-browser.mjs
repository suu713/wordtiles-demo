import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../../outputs/wt-simulation-range-20261026/browser/',import.meta.url));await mkdir(out,{recursive:true});
const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url)));
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1800,height:1050}}),checks=[],errors=[],failed=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))failed.push([r.status(),r.url()]);});
await page.addInitScript(()=>{
  window.simulationTestJobs=[];window.simulationTestRuns=[];const Native=Worker;
  window.Worker=class extends Native{
    constructor(url,options){super(url,options);this.isSimulation=String(url).includes('simulation-batch.worker');if(this.isSimulation)this.addEventListener('message',({data})=>{if(data.type==='run')window.simulationTestRuns.push({...data.summary,number:data.number,index:data.index});});}
    postMessage(job,...args){if(this.isSimulation){window.simulationTestRuns=[];window.simulationTestJobs.push({profile:job.profile,repeats:job.repeats,entries:job.entries.map(e=>({number:e.number,level:e.level}))});}return super.postMessage(job,...args);}
  };
});
const waitSource=async(source,order)=>page.waitForFunction(({source,order})=>{
  const p=document.querySelector('#sim-source'),b=document.querySelector('#sim-bank');return p.value===source&&!p.disabled&&(!order||b.value===order&&!b.disabled)&&document.querySelector('#sim-source-status').textContent==='';
},{source,order});
async function range(start,end,repeats){await page.locator('#sim-range-start').fill(String(start));await page.locator('#sim-range-end').fill(String(end));await page.locator('#sim-repeats').fill(String(repeats));}
async function run(order,numbers,repeats){
  const before=await page.evaluate(()=>window.simulationTestJobs.length);await page.locator('#sim-batch-start').click();
  await page.waitForFunction(n=>window.simulationTestJobs.length===n+1&&document.querySelector('#sim-status').textContent.startsWith('批量试玩完成'),before);
  const job=await page.evaluate(()=>window.simulationTestJobs.at(-1)),runs=await page.evaluate(()=>window.simulationTestRuns);
  assert.deepEqual(job.entries.map(e=>e.number),numbers);assert.equal(job.repeats,repeats);assert.equal(runs.length,numbers.length*repeats);
  assert.ok(runs.every(r=>['won','gave-up'].includes(r.outcome)),JSON.stringify(runs.filter(r=>!['won','gave-up'].includes(r.outcome))));
  if(order)for(const entry of job.entries){assert.equal(entry.level.source.order,order);assert.equal(entry.level.source.original.id,bank.orders[order][entry.number-1]);assert.deepEqual(entry.level.source.original,bank.levels[entry.level.source.original.id]);}
  return {job,runs};
}
async function selectBank(key){await page.locator('#sim-bank').selectOption(key);await waitSource('wordtiles',key);}
try{
  await page.goto('http://127.0.0.1:4173/?source=wordtiles&list=level_list_0&level=1');await page.waitForFunction(()=>!document.querySelector('#start-game').disabled);await page.locator('#lobby-editor').click();await page.locator('[data-lab-tab="simulate"]').click();await waitSource('wordtiles','level_list_0');
  assert.equal(await page.locator('#sim-source').inputValue(),'wordtiles');assert.equal(await page.locator('#sim-bank option').count(),6);assert.equal(await page.locator('#sim-range-fields').isVisible(),true);assert.equal(await page.locator('#sim-scope').inputValue(),'current');
  assert.equal(await page.locator('#sim-range-end').getAttribute('max'),'1500');pass('模拟试玩内直接显示原包来源、6个列表及可手填的起止关号');
  await page.locator('#sim-knowledge-percent').fill('75');await page.locator('#sim-knowledge-percent').press('Tab');await range(2,4,5);assert.equal(await page.locator('#sim-scope').inputValue(),'range');assert.match(await page.locator('#sim-selection-summary').textContent(),/共 3 关.*每关 5 次 = 15 局/);
  await page.mouse.move(900,30);await page.locator('#editor-panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:out+'source-range-controls.png',fullPage:true});
  const first=await run('level_list_0',[2,3,4],5);assert.equal(first.job.profile.knowledgeRate,.75);assert.equal(await page.locator('#sim-range-results tr').count(),3);
  const rows=await page.locator('#sim-range-results tr').allTextContents();for(const [i,row] of rows.entries())assert.ok(row.includes('ID '+bank.orders.level_list_0[i+1]));
  pass('手填2～4关只计算这3关、含两端；认识比例传入模型，15局有效');
  await page.locator('#sim-range-results tr').nth(1).click();await page.waitForFunction(()=>document.querySelector('#source-number').value==='3');assert.equal(await page.locator('#sim-bank').inputValue(),'level_list_0');assert.equal(await page.locator('#sim-range-start').inputValue(),'2');assert.equal(await page.locator('#sim-range-end').inputValue(),'4');pass('逐关结果带原ID，点击回看同一关且保留手填范围');
  const beforeInvalid=await page.evaluate(()=>window.simulationTestJobs.length);
  for(const [start,end,repeats,pattern] of [[0,3,1,/整数/],[3,2,1,/不能小于/],[1.5,3,1,/整数/],['',3,1,/整数/],[1,1501,1,/1500/],[1,201,1000,/200,000/]]){
    await range(start,end,repeats);assert.match(await page.locator('#sim-selection-summary').textContent(),pattern);await page.locator('#sim-batch-start').click();assert.equal(await page.evaluate(()=>window.simulationTestJobs.length),beforeInvalid);assert.match(await page.locator('#sim-status').textContent(),pattern);
  }pass('空白、小数、倒序、超出列表和超出总局数不会启动');
  await range(1500,1500,1);await run('level_list_0',[1500],1);pass('相同起止关号支持单关，主线最后一关可运行');
  await selectBank('level_list_2');assert.equal(await page.locator('#source-order').inputValue(),'level_list_2');assert.equal(await page.locator('#sim-range-end').getAttribute('max'),'1000');await range(31,33,2);const curtain=await run('level_list_2',[31,32,33],2);assert.equal(curtain.job.entries[0].level.source.original.id,113778);pass('模拟区可直接切换主线表，按原包帘子关31～33运行');
  await selectBank('daily_puzzle_level_list');assert.equal(await page.locator('#sim-range-end').getAttribute('max'),'366');await range(1,2,2);await run('daily_puzzle_level_list',[1,2],2);pass('每日原包关卡按366关的原列表编号运行');
  await selectBank('all');assert.equal(await page.locator('#sim-range-end').getAttribute('max'),'3459');await range(3459,3459,1);await run('all',[3459],1);pass('全量独立关卡范围支持1～3459，末关数据正确');
  await page.locator('#sim-source').selectOption('web');await waitSource('web');assert.equal(await page.locator('#play-source').inputValue(),'web');assert.equal(await page.locator('#sim-bank-field').isVisible(),false);
  await page.locator('#sim-scope').selectOption('current');await page.locator('#sim-repeats').fill('2');const generated=await run(null,[undefined],2);assert.notEqual(generated.job.entries[0].level.algorithm,1);pass('模拟区切回生成关，当前关试玩仍正常');
  await page.locator('#sim-source').selectOption('wordtiles');await waitSource('wordtiles','level_list_0');assert.equal(await page.locator('#sim-scope').inputValue(),'range');await range(1,20,1000);await page.locator('#sim-batch-start').click();assert.equal(await page.locator('#sim-source').isDisabled(),true);assert.equal(await page.locator('#sim-bank').isDisabled(),true);assert.equal(await page.locator('#sim-range-start').isDisabled(),true);await page.locator('#sim-batch-stop').click();
  assert.match(await page.locator('#sim-status').textContent(),/已取消/);const stopped=await page.locator('#sim-status').textContent();await page.waitForTimeout(200);assert.equal(await page.locator('#sim-status').textContent(),stopped);assert.equal(await page.locator('#sim-source').isEnabled(),true);pass('范围计算时锁定来源和输入，取消保留部分结果并解锁');
  await range(1,20,100);await page.setViewportSize({width:390,height:844});await page.locator('#controls-open').click();await page.locator('#editor-panel').evaluate(el=>el.scrollTop=0);await page.mouse.move(1,1);await page.locator('#editor-panel').screenshot({path:out+'mobile-source-range.png'});assert.equal(await page.locator('#sim-range-start').isVisible(),true);assert.ok((await page.locator('#sim-range-end').boundingBox()).x>=0);pass('手机配置面板可见原包列表与起止关号');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await writeFile(out+'checks.json',JSON.stringify({checks,errors,failed},null,2));
}catch(error){await page.screenshot({path:out+'failure.png',fullPage:true});await writeFile(out+'failure.json',JSON.stringify({error:error.stack,errors,failed,notice:await page.locator('#notice').textContent(),simulation:await page.locator('#sim-status').textContent()},null,2));throw error;}
finally{await browser.close();}
