import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const directory = fileURLToPath(new URL('../reports/', import.meta.url));
await mkdir(directory, { recursive: true });
const sample = JSON.parse(await readFile(new URL('../dist/sample.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('../examples/seed_20261010.json', import.meta.url), 'utf8'));
const { convertSourceLevel } = await import('../dist/core/source-levels.js');
const { findWordPaths, signature } = await import('../dist/core/rules.js');
const sourceCatalogue = JSON.parse(await readFile(new URL('../dist/source-levels/catalogue.json',import.meta.url),'utf8'));
const sourceBanks = Object.fromEntries(await Promise.all(sourceCatalogue.languages.map(async info => [info.language,JSON.parse(await readFile(new URL('../dist/source-levels/' + info.file,import.meta.url),'utf8'))])));
const baseURL = process.env.WORDTILES_URL || 'http://127.0.0.1:4173';
const cases = [], errors = [];
let browser;
try { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
const context = await browser.newContext({ viewport: { width: 1280, height: 1040 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
async function run(name, task) { await task(); cases.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function state(target = page) {
  return target.evaluate(() => ({
    counts: [...document.querySelectorAll('.tile')].map(tile => Number(tile.dataset.remaining)),
    completed: [...document.querySelectorAll('.target.completed')].map(target => target.dataset.word),
    letters: [...document.querySelectorAll('.tile-letter')].map(letter => letter.textContent),
    seed: document.querySelector('#active-seed').textContent
  }));
}
async function centers(path, target = page) {
  await target.locator('#board').scrollIntoViewIfNeeded();
  return Promise.all(path.map(async cell => {
    const rect = await target.locator(`[data-cell="${cell}"]`).boundingBox();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }));
}
async function drag(path, target = page) {
  const points = await centers(path, target);
  await target.mouse.move(points[0].x, points[0].y); await target.mouse.down();
  for (const point of points.slice(1)) await target.mouse.move(point.x, point.y, { steps: 1 });
  await target.mouse.up();
}
async function reset() {
  await page.locator('#file-action').selectOption('sample');
  assert.deepEqual((await state()).counts, sample.board.counts);
}
async function exportLevel(name) {
  const downloadPromise = page.waitForEvent('download'); await page.locator('#file-action').selectOption('export');
  const download = await downloadPromise;
  await download.saveAs(`${directory}/${name}.json`);
  return JSON.parse(await readFile(`${directory}/${name}.json`, 'utf8'));
}
async function openSettings(pane,target=page) { await target.locator('#options-menu').selectOption(pane); }
async function closeSettings(target=page) { if (await target.locator('#settings-popover').isVisible()) await target.locator('#settings-close').click(); }
async function setView(value) { await openSettings('view'); await page.locator('#preview-device').selectOption(value); await closeSettings(); }
async function openEditor(target) { if (await target.locator('#editor-toggle').isVisible() && !await target.locator('.editor-panel').isVisible()) await target.locator('#editor-toggle').click(); }
try {
  await page.goto(baseURL); await page.locator('#validation-badge').filter({ hasText:'需求不变量通过' }).waitFor({ state: 'attached' });
  async function sourceLevel(language, order='main', position=1, target=page) {
    await target.locator('#algorithm').selectOption('1');
    await target.locator('#source-language').selectOption(language);
    await target.locator('#source-order').selectOption(order);
    await target.locator('#source-number').selectOption(String(position));
    await target.locator('#source-load').click();
    const bank=sourceBanks[language], raw=bank.levels[bank.orders[order][position-1]];
    await target.waitForFunction(id=>document.querySelector('#active-seed').textContent===String(id),raw.id);
    await target.locator('#notice').filter({ hasText:'需求不变量校验通过' }).waitFor({ state: 'attached' });
    return convertSourceLevel(raw,{ language,order,position });
  }
  function rawPaths(level,word) { return findWordPaths(level.board.letters,word,null,null,level.board); }
  async function fitsPortrait(target=page) {
    return target.evaluate(() => {
      const viewport=document.querySelector('#game-viewport').getBoundingClientRect();
      const board=document.querySelector('#board').getBoundingClientRect();
      const actions=document.querySelector('.play-actions').getBoundingClientRect();
      return { fits:board.top>=viewport.top && board.bottom<=viewport.bottom+1 && actions.bottom<=viewport.bottom+1,ratio:viewport.width/viewport.height,tile:document.querySelector('.tile').getBoundingClientRect().width,scroll:document.querySelector('#game-viewport').scrollHeight<=document.querySelector('#game-viewport').clientHeight+1 };
    });
  }
  await run('算法1默认载入真实原包第1关，左编辑器右9:16画面，无手机外框',async () => {
    const editor=await page.locator('.editor-panel').boundingBox(), viewport=await page.locator('#game-viewport').boundingBox();
    assert.ok(editor.x+editor.width<viewport.x);
    assert.ok(Math.abs(viewport.width/viewport.height-9/16)<.001);
    assert.equal(await page.locator('.phone-frame,.phone-statusbar,.home-indicator').count(),0);
    assert.equal(await page.locator('#algorithm').inputValue(),'1');
    assert.equal(await page.locator('#active-seed').textContent(),'191596');
    assert.equal(await page.locator('#source-number').getAttribute('max'),'5000');
    assert.equal(await page.locator('#board-cols').isDisabled(),true);
    assert.equal(await page.locator('#word-count').inputValue(),'3');
    assert.deepEqual((await state()).counts,Array(9).fill(1));
    assert.equal((await fitsPortrait()).fits,true);
    assert.equal((await fitsPortrait()).scroll,true);
    await page.screenshot({ path:directory+'/source-desktop.png',fullPage:true });
  });
  await run('原包真实鼠标反序清空，第2关额外词记录且不扣次数',async () => {
    const bank=sourceBanks.english, first=convertSourceLevel(bank.levels[bank.orders.main[0]],{ language:'english',order:'main',position:1 });
    for (const target of [...first.targets].reverse()) await drag(target.path);
    assert.equal(await page.locator('#win-banner').isVisible(),true);
    assert.deepEqual((await state()).counts,Array(9).fill(0));
    await page.screenshot({ path:directory+'/source-completed.png',fullPage:true });
    await page.locator('#win-next').click(); await page.waitForFunction(()=>document.querySelector('#active-seed').textContent==='191599');
    assert.equal(await page.locator('#source-number').inputValue(),'2');
    const second=await exportLevel('source-second'), before=await state();
    await drag(rawPaths(second,'FRO')[0]);
    assert.deepEqual(await state(),before);
    assert.ok((await page.locator('#feedback').textContent()).includes('额外词 FRO 已记录'));
    await drag(rawPaths(second,'FRO')[0]);
    assert.ok((await page.locator('#feedback').textContent()).includes('已经记过'));
    assert.deepEqual(second.source.original,bank.levels[bank.orders.main[1]]);
  });
  await run('原包JSON往返、破损次数导入拒绝，切换算法自动跟随导入格式',async () => {
    const exported=await exportLevel('source-roundtrip'), before=await state(), wrong=structuredClone(exported);
    wrong.board.counts[0]++;
    await page.locator('#import-file').setInputFiles({ name:'source-wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(wrong)) });
    await page.locator('#notice').filter({ hasText:'导入被拒绝' }).waitFor({ state: 'attached' }); assert.deepEqual(await state(),before);
    await page.locator('#algorithm').selectOption('2');
    await page.locator('#validation-badge').filter({ hasText:'32 / 32 通过' }).waitFor({ state: 'attached' });
    await page.locator('#import-file').setInputFiles({ name:'source-valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported)) });
    await page.locator('#level-kind').filter({ hasText:'JSON 导入' }).waitFor();
    assert.equal(await page.locator('#algorithm').inputValue(),'1');
    assert.deepEqual((await state()).counts,exported.board.counts);
    assert.deepEqual((await exportLevel('source-after-import')).source,exported.source);
  });
  await run('两算法各自保留试玩进度，算法2显示固定V1规则',async () => {
    const level=await sourceLevel('english');
    await drag(level.targets[0].path); const native=await state();
    await page.locator('#algorithm').selectOption('2'); await reset();
    await drag([0,3,4]); const generated=await state();
    assert.equal(await page.locator('#board-cols').isDisabled(),true);
    await page.locator('#algorithm').selectOption('1'); assert.deepEqual(await state(),native);
    await page.locator('#algorithm').selectOption('2'); assert.deepEqual(await state(),generated);
    assert.equal(await page.locator('#board-cols').inputValue(),'3');
    assert.equal(await page.locator('#draft-tag').textContent(),'已应用');
    await reset();
  });
  await run('五语言主线关卡均来自原包，Unicode字母可拖动清空',async () => {
    for (const language of sourceCatalogue.languages.map(info=>info.language)) {
      const level=await sourceLevel(language), raw=sourceBanks[language].levels[sourceBanks[language].orders.main[0]];
      assert.deepEqual((await exportLevel('source-'+language)).source.original,raw);
      assert.deepEqual((await state()).letters,level.board.letters);
      for (const target of level.targets) await drag(target.path);
      assert.equal((await state()).counts.reduce((a,b)=>a+b,0),0);
      assert.equal((await fitsPortrait()).fits,true);
    }
  });
  await run('原包18目标、高次数数字徽标与长词，在360×640内保护棋盘和操作区',async () => {
    await setView('360x640');
    const large=await sourceLevel('spanish','all',1221);
    assert.equal(large.targets.length,18);
    assert.equal(await page.locator('.target').count(),18);
    assert.equal(await page.locator('#word-count').inputValue(),'18');
    assert.ok(await page.locator('.count-badge').count()>0);
    const fitted=await fitsPortrait();
    assert.equal(fitted.fits,true); assert.equal(fitted.scroll,true); assert.ok(fitted.tile>=32);
    await page.screenshot({ path:directory+'/source-18-targets.png',fullPage:true });
    for (const target of [...large.targets].reverse()) await drag(target.path);
    assert.deepEqual((await state()).counts,Array(large.board.letters.length).fill(0));
    const bank=sourceBanks.english, raw=Object.values(bank.levels).find(raw=>raw.target_words.some(t=>t.word.length===10));
    const position=bank.orders.all.indexOf(raw.id)+1;
    const long=await sourceLevel('english','all',position);
    assert.ok(long.config.wordLengths.includes(10));
    await page.locator('#hint').click();
    assert.equal((await fitsPortrait()).fits,true);
    await page.screenshot({ path:directory+'/source-long-word.png',fullPage:true });
    for (const target of long.targets) await drag(target.path);
    assert.equal((await state()).counts.reduce((a,b)=>a+b,0),0);
    await setView('auto');
  });
  await run('原包不同消耗路径真实提交拒绝，参考路径可完成整关',async () => {
    const level=await sourceLevel('english','all',8);
    let selected;
    for (const target of level.targets) {
      const paths=rawPaths(level,target.word), alternate=paths.find(path=>signature(path)!==signature(target.path));
      if (alternate) { selected=alternate; break; }
    }
    assert.ok(selected); const before=await state(); await drag(selected);
    assert.deepEqual(await state(),before);
    assert.ok((await page.locator('#feedback').textContent()).includes('换一条消耗路径'));
    for (const target of level.targets) await drag(target.path);
    assert.equal((await state()).counts.reduce((a,b)=>a+b,0),0);
  });
  await run('载入迟到结果不能覆盖切算法或新的关卡序号',async () => {
    const isolated=await browser.newContext({ viewport:{ width:1280,height:1040 },reducedMotion:'reduce' }), tab=await isolated.newPage();
    tab.on('pageerror',error=>errors.push(error.message));
    for (const language of ['portuguese','russian']) await tab.route('**/source-levels/'+language+'.json',async route=>{
      await new Promise(resolve=>setTimeout(resolve,500));
      await route.fulfill({ contentType:'application/json',body:JSON.stringify(sourceBanks[language]) });
    });
    await tab.goto(baseURL); await tab.locator('#validation-badge').filter({ hasText:'需求不变量通过' }).waitFor({ state: 'attached' });
    await tab.locator('#source-language').selectOption('portuguese');
    await tab.locator('#algorithm').selectOption('2');
    await tab.waitForTimeout(700);
    assert.equal(await tab.locator('#algorithm').inputValue(),'2');
    assert.deepEqual((await state(tab)).counts,sample.board.counts);
    await tab.locator('#algorithm').selectOption('1');
    await tab.locator('#source-language').selectOption('russian');
    await tab.locator('#source-number').selectOption('2');
    await tab.waitForTimeout(700);
    assert.equal(await tab.locator('#active-seed').textContent(),'191596');
    assert.equal(await tab.locator('#draft-tag').textContent(),'待应用');
    await tab.locator('#source-load').click();
    await tab.waitForFunction(id=>document.querySelector('#active-seed').textContent===String(id),sourceBanks.russian.orders.main[1]);
    await isolated.close();
  });
  await page.locator('#algorithm').selectOption('2'); await reset();
  await page.locator('#validation-badge').filter({ hasText:'32 / 32 通过' }).waitFor({ state: 'attached' });
  await run('桌面左侧编辑器、右侧竖屏预览，默认折叠调试面板', async () => {
    const editor = await page.locator('.editor-panel').boundingBox();
    const phone = await page.locator('.game-viewport').boundingBox();
    assert.ok(editor.x + editor.width < phone.x);
    assert.ok(Math.abs(phone.width / phone.height - 9 / 16) < .001);
    assert.ok((await fitsPortrait()).fits);
    assert.equal(await page.locator('#game-viewport').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, '默认手游界面应完整显示');
    assert.equal(await page.locator('#word-lengths select').count(), 1);
    assert.equal(await page.locator('#target-length-list option').count(), 5);
    assert.equal(await page.locator('.tile').count(), 9);
    assert.equal(await page.locator('.target').count(), 5);
    assert.equal(await page.locator('#settings-popover').isVisible(), false);
    assert.deepEqual((await state()).counts, sample.board.counts);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), true);
    await page.screenshot({ path: `${directory}/desktop.png`, fullPage: true });
  });
  await run('真实拖动 FEED；经过 FEE 时不提交，松手才扣减', async () => {
    const points = await centers([1, 4, 7, 8]);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const point of points.slice(1, 3)) await page.mouse.move(point.x, point.y);
    assert.equal(await page.locator('#current-word').textContent(), 'FEE');
    assert.deepEqual((await state()).counts, sample.board.counts);
    assert.deepEqual((await state()).completed, []);
    await page.mouse.move(points[3].x, points[3].y); await page.mouse.up();
    assert.deepEqual((await state()).completed, ['FEED']);
    assert.equal((await state()).counts.reduce((a, b) => a + b), 14);
  });
  await run('EYE 两种走法、归零空位保留原布局', async () => {
    await reset(); await drag([0, 3, 4]); const forward = await state();
    assert.equal(await page.locator('.tile').count(), 9);
    assert.equal(await page.locator('[data-cell="0"]').getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('[data-cell="3"] .tile-letter').textContent(), '·');
    await reset(); await drag([4, 3, 0]); assert.deepEqual(await state(), forward);
  });
  await run('拖回上一格撤回一步；斜向和重复格不追加', async () => {
    await reset(); const points = await centers([0, 3, 4, 3]);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
    assert.equal(await page.locator('#current-word').textContent(), 'EY');
    await page.mouse.up(); assert.deepEqual((await state()).counts, sample.board.counts);
    await drag([0, 4]); assert.deepEqual((await state()).counts, sample.board.counts);
  });
  await run('非目标与已完成目标不扣减；取消拖动不提交', async () => {
    await reset(); await drag([0, 1, 2]); assert.deepEqual((await state()).counts, sample.board.counts);
    await drag([1, 4, 7]); const before = await state(); await drag([1, 4, 7]); assert.deepEqual(await state(), before);
    await reset(); const points = await centers([0, 3, 4]);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
    await page.dispatchEvent('#board', 'pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    await page.mouse.up(); assert.deepEqual((await state()).counts, sample.board.counts);
  });
  await run('键盘找词、提示不消耗、真实鼠标完成整关', async () => {
    await reset(); await page.locator('[data-cell="0"]').focus();
    for (const key of ['Space', 'ArrowDown', 'Space', 'ArrowRight', 'Space']) await page.keyboard.press(key);
    assert.equal(await page.locator('#current-word').textContent(), 'EYE');
    await page.keyboard.press('Enter'); assert.deepEqual((await state()).completed, ['EYE']);
    const before = await state(); await page.locator('#hint').click(); assert.deepEqual(await state(), before);
    assert.ok(await page.locator('.hinted').count() >= 3);
    for (const target of sample.targets.slice(1)) await drag(target.path);
    assert.deepEqual((await state()).counts, Array(9).fill(0));
    assert.equal(await page.locator('#win-banner').isVisible(), true);
    assert.equal(await page.locator('#hint').isDisabled(), true);
    await page.screenshot({ path: `${directory}/completed.png`, fullPage: true });
    await page.locator('#restart').click(); await page.waitForTimeout(350);
    assert.deepEqual((await state()).counts, sample.board.counts);
  });
  await run('JSON 导出初始状态、拒绝次数错误和多集合、有效导入', async () => {
    await drag([0, 3, 4]); const exported = await exportLevel('sample-export');
    assert.deepEqual(exported.board.counts, sample.board.counts);
    const before = await state();
    const wrong = structuredClone(sample); [wrong.board.counts[0], wrong.board.counts[1]] = [wrong.board.counts[1], wrong.board.counts[0]];
    await page.locator('#import-file').setInputFiles({ name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(wrong)) });
    await page.locator('#notice').filter({ hasText: '导入被拒绝' }).waitFor({ state: 'attached' }); assert.deepEqual(await state(), before);
    const ambiguous = structuredClone(sample); ambiguous.board.letters[6] = 'F';
    await page.locator('#import-file').setInputFiles({ name: 'ambiguous.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ambiguous)) });
    await page.waitForFunction(() => document.querySelector('#debug-rejection').textContent.includes('AMBIGUOUS')); assert.deepEqual(await state(), before);
    await page.locator('#import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.locator('#notice').filter({ hasText: '导入失败' }).waitFor({ state: 'attached' }); assert.deepEqual(await state(), before);
    await page.locator('#import-file').setInputFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.locator('#level-kind').filter({ hasText: 'JSON 导入' }).waitFor(); assert.deepEqual((await state()).counts, sample.board.counts);
  });
  await run('真实 Worker 生成，seed 重现同关，导出后再次导入', async () => {
    await page.locator('#seed').fill('20261010'); await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({ hasText: '生成成功' }).waitFor({ state: 'attached' });
    const first = await exportLevel('generated-export');
    assert.deepEqual(first,fixture);
    assert.deepEqual((await state()).counts,fixture.initialCounts);
    assert.deepEqual((await state()).letters,fixture.letters);
    await page.screenshot({path:directory+'/algorithm-v1-generated.png',fullPage:true});
    await page.locator('#generate-seed').click(); await page.locator('#notice').filter({ hasText: '生成成功' }).waitFor({ state: 'attached' });
    assert.deepEqual(await exportLevel('generated-repeat'), first);
    await page.locator('#import-file').setInputFiles({ name: 'generated.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(first)) });
    await page.locator('#level-kind').filter({ hasText: 'JSON 导入' }).waitFor();
    assert.equal((await state()).seed, String(first.seed));
    for (const target of first.targets) await drag(target.canonicalPath);
    assert.deepEqual((await state()).counts, Array(9).fill(0));
    assert.equal(await page.locator('#completion').textContent(),'5 / 5');
    await page.screenshot({path:directory+'/algorithm-v1-completed.png',fullPage:true});
    await page.locator('#restart').click();
    for (const target of [...first.targets].reverse()) await drag(target.canonicalPath);
    assert.deepEqual((await state()).counts,Array(9).fill(0));
    assert.deepEqual(await exportLevel('algorithm-v1-after-win'),fixture);
  });
  await run('极小预算失败提示明确，棋盘和进度保留', async () => {
    await reset(); await drag([0, 3, 4]); const before = await state();
    await openSettings('debug');
    for (const id of ['#budget-attempt', '#budget-tries', '#budget-total']) await page.locator(id).fill('1');
    await closeSettings();
    await page.locator('#generate-seed').click();
    await page.waitForFunction(()=>document.querySelector('#debug-generation').textContent.includes('SEARCH_BUDGET_EXCEEDED'));
    assert.ok((await page.locator('#notice').textContent()).includes('保留'));
    assert.deepEqual(await state(), before);
    await openSettings('debug');
    await page.locator('#budget-attempt').fill('10000'); await page.locator('#budget-tries').fill('30'); await page.locator('#budget-total').fill('300000');
    await closeSettings();
  });
  await run('取消生成和切关隔离旧 Worker；旧效果不会污染重开', async () => {
    await page.route('**/generator.worker.js', async route => {
      const original = await readFile(new URL('../dist/generator.worker.js', import.meta.url), 'utf8');
      await route.fulfill({ contentType: 'text/javascript', body: `${original}\nconst handler=self.onmessage;self.onmessage=event=>setTimeout(()=>handler(event),500);` });
    });
    await reset(); const before = await state();
    await page.locator('#generate-seed').click(); await page.locator('#cancel-generation').click();
    await page.waitForTimeout(700); assert.deepEqual(await state(), before);
    assert.ok((await page.locator('#notice').textContent()).includes('取消'));
    await page.locator('#generate-seed').click(); await page.locator('#algorithm').selectOption('1');
    const originalSource = await state();
    await page.waitForTimeout(700); assert.deepEqual(await state(), originalSource);
    assert.equal(await page.locator('#algorithm').inputValue(), '1');
    await page.locator('#algorithm').selectOption('2'); assert.deepEqual(await state(), before);
    await page.locator('#generate-seed').click(); await page.locator('#file-action').selectOption('sample');
    await page.waitForTimeout(700); assert.equal(await page.locator('#level-kind').textContent(), '固定样例');
    assert.deepEqual((await state()).counts, sample.board.counts);
    await drag([0,3,4]);
    await page.locator('#generate-seed').click(); await page.locator('#restart').click();
    await page.waitForTimeout(700);
    assert.deepEqual((await state()).counts, sample.board.counts);
    assert.equal(await page.locator('#cancel-generation').isVisible(), false);
    assert.equal(await page.locator('#draft-tag').textContent(), '已应用');
    assert.ok((await page.locator('#feedback').textContent()).includes('重开'));
    assert.ok((await page.locator('#debug-generation').textContent()).includes('CANCELLED'));
    await page.locator('#seed').fill('1'); await page.locator('#generate-seed').click();
    // Repeated clicks during an active request are disabled; cancel and start a new request.
    assert.equal(await page.locator('#generate-seed').isDisabled(),true);
    await page.locator('#cancel-generation').click();
    await page.locator('#seed').fill('20261010'); await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({ state: 'attached' });
    await page.waitForTimeout(700);
    assert.deepEqual(await exportLevel('algorithm-v1-after-cancel'),fixture);
    await reset();
    await page.unroute('**/generator.worker.js');
    await closeSettings();
  });
  async function generateSeed(seed) {
    await page.locator('#seed').fill(String(seed)); await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({ hasText: '生成成功' }).waitFor({ state: 'attached', timeout: 60000 });
  }
  await run('V1尺寸、目标数与逐词长度锁定，预算可调并共用新词库', async () => {
    await reset();
    for (const id of ['#board-cols','#board-rows','#word-count','#uniform-length']) assert.equal(await page.locator(id).isDisabled(),true);
    assert.equal(await page.locator('#word-count').inputValue(),'5');
    assert.deepEqual(await page.locator('#target-length-list option').evaluateAll(items=>items.map(el=>Number(el.textContent.match(/· (\d+)/)[1]))),[3,3,3,4,5]);
    await openSettings('board');
    await page.locator('#target-length-list').selectOption('4');
    assert.equal(await page.locator('#draft-tag').textContent(),'已应用');
    assert.deepEqual(await page.locator('#target-length-list option').evaluateAll(items=>items.map(el=>Number(el.textContent.match(/· (\d+)/)[1]))),[3,3,3,4,5]);
    await closeSettings();
    assert.ok((await page.locator('#config-status').textContent()).includes('V1 固定规则'));
    assert.ok((await page.locator('#version-note').textContent()).includes('demo-test-20261010-v1'));
    assert.ok((await page.locator('#version-note').textContent()).includes('1602'));
    assert.equal(await page.locator('#draft-tag').textContent(), '已应用');
  });
  await run('平铺V1 JSON往返与重开不混入游玩状态，拒绝坏路径、次数、ID和非白名单词', async () => {
    await generateSeed(20261010); await drag(fixture.targets[0].canonicalPath);
    const before=await state(); assert.deepEqual(await exportLevel('algorithm-v1-partial'),fixture);
    const mutations=[l=>l.initialCounts[0]++,l=>l.targets[1].id=l.targets[0].id,
      l=>l.targets[0].canonicalPath=[8,4,2],l=>l.targets[0].word='ZZZ',l=>l.targets=['EAT'],l=>l.maxCellUses=4];
    for(const mutate of mutations) {
      const level=structuredClone(fixture); mutate(level);
      await page.locator('#import-file').setInputFiles({name:'invalid-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(level))});
      await page.locator('#notice').filter({hasText:'导入被拒绝'}).waitFor({ state: 'attached' });
      assert.deepEqual(await state(),before);
    }
    await page.locator('#restart').click();
    assert.deepEqual((await state()).counts,fixture.initialCounts);
    assert.deepEqual((await state()).completed,[]);
    assert.deepEqual(await exportLevel('algorithm-v1-restarted'),fixture);
    await page.locator('#import-file').setInputFiles({name:'seed_20261010.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('#level-kind').filter({hasText:'JSON 导入'}).waitFor();
    assert.deepEqual(await exportLevel('algorithm-v1-imported'),fixture);
  });
  await run('非法seed及预算输入不启动Worker、不改当前关卡；seed0有效', async () => {
    await drag(fixture.targets[0].canonicalPath); const before=await state();
    for(const seed of ['', '-1', '1.5', 'abc', '4294967296']) {
      await page.locator('#seed').fill(seed); await page.locator('#generate-seed').click();
      assert.ok((await page.locator('#notice').textContent()).includes('seed 必须'));
      assert.deepEqual(await state(),before); assert.equal(await page.locator('#cancel-generation').isVisible(),false);
    }
    await openSettings('debug');
    await page.locator('#budget-attempt').fill('1.5'); await closeSettings(); await page.locator('#generate').click();
    assert.ok((await page.locator('#notice').textContent()).includes('正整数')); assert.deepEqual(await state(),before);
    await openSettings('debug'); await page.locator('#budget-attempt').fill('10000'); await closeSettings();
    await generateSeed(0); assert.equal((await state()).seed,'0');
    assert.equal((await exportLevel('algorithm-v1-seed-zero')).seed,0);
  });
  await run('多关真实拖动任意顺序清空，下一关与生成新关使用uint32种子', async () => {
    for(const seed of [0,42,999]) {
      await generateSeed(seed);
      const level=await exportLevel('algorithm-v1-browser-'+seed);
      assert.equal(level.dictionaryVersion,'demo-test-20261010-v1'); assert.equal(await page.locator('#validation-badge').textContent(),'32 / 32 通过');
      for(const target of [...level.targets].reverse()) await drag(target.canonicalPath);
      assert.deepEqual((await state()).counts,Array(9).fill(0));
    }
    await page.locator('#win-next').click(); await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({ state: 'attached' });
    const next=await exportLevel('algorithm-v1-next'); assert.ok(Number.isInteger(next.seed) && next.seed>=0 && next.seed<=4294967295);
    assert.deepEqual((await state()).completed,[]);
    await page.locator('#generate').click(); await page.locator('#notice').filter({hasText:'生成成功'}).waitFor({ state: 'attached' });
    const fresh=await exportLevel('algorithm-v1-random'); assert.ok(Number.isInteger(fresh.seed) && fresh.seed>=0 && fresh.seed<=4294967295);
  });
  await run('V1同集合反向路径接受，JSON切关取消迟到Worker且保持原始数据',async()=>{
    const rawSample={...fixture,letters:sample.board.letters,initialCounts:sample.board.counts,
      targets:sample.targets.map((t,i)=>({id:'W'+i,word:t.word,canonicalPath:t.path}))};
    await page.locator('#import-file').setInputFiles({name:'palindrome-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rawSample))});
    await page.locator('#level-kind').filter({hasText:'JSON 导入'}).waitFor();
    await drag([4,3,0]); assert.deepEqual((await state()).completed,['EYE']);
    assert.deepEqual(await exportLevel('algorithm-v1-palindrome'),rawSample);
    await page.route('**/generator.worker.js',async route=>{
      const original=await readFile(new URL('../dist/generator.worker.js',import.meta.url),'utf8');
      await route.fulfill({contentType:'text/javascript',body:`${original}\nconst handler=self.onmessage;self.onmessage=event=>setTimeout(()=>handler(event),500);`});
    });
    await page.locator('#generate-seed').click();
    await page.locator('#import-file').setInputFiles({name:'seed_20261010.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('#level-kind').filter({hasText:'JSON 导入'}).waitFor();
    await drag(fixture.targets[0].canonicalPath); const before=await state();
    await page.waitForTimeout(700); assert.deepEqual(await state(),before);
    assert.deepEqual(await exportLevel('algorithm-v1-after-import-cancel'),fixture);
    await page.unroute('**/generator.worker.js');
  });
  await run('Worker异常明确失败，保留V1当前关卡和已完成目标',async()=>{
    const before=await state();
    await page.route('**/generator.worker.js',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{throw new Error("test-worker-failure")};'}));
    await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({hasText:'生成线程未能启动'}).waitFor({ state: 'attached' });
    assert.deepEqual(await state(),before); assert.equal(await page.locator('#cancel-generation').isVisible(),false);
    await page.unroute('**/generator.worker.js');
  });
  await run('9:16画面尺寸与缩放可调整，保持关卡和进度', async () => {
    const before = await state();
    await openSettings('view');
    await page.locator('#preview-device').selectOption('450x800');
    await page.locator('#preview-zoom').selectOption('100');
    assert.deepEqual(await page.locator('#game-viewport').evaluate(el => [el.offsetWidth, el.offsetHeight]), [450, 800]);
    const big = await page.locator('.viewport-sizer').boundingBox();
    await page.locator('#preview-zoom').selectOption('75');
    const small = await page.locator('.viewport-sizer').boundingBox();
    assert.ok(small.width < big.width && small.height < big.height);
    await page.locator('#preview-device').selectOption('360x640');
    assert.deepEqual(await page.locator('#game-viewport').evaluate(el => [el.offsetWidth, el.offsetHeight]), [360, 640]);
    assert.deepEqual(await state(), before);
    await page.locator('#preview-device').selectOption('auto');
    await page.locator('#preview-zoom').selectOption('100');
    await closeSettings();
    await reset();
  });
  await run('玩法悬停提示与移动端收起编辑器，真实触摸拖动', async () => {
    await page.locator('#rules-button').hover(); assert.equal(await page.locator('#hover-help').isVisible(), true);
    assert.ok((await page.locator('#hover-help').textContent()).includes('松手提交'));
    await page.mouse.move(0,0); assert.equal(await page.locator('#hover-help').isVisible(),false);
    await page.locator('#rules-button').focus(); assert.equal(await page.locator('#hover-help').isVisible(),true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#hover-help').isVisible(),false);
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(baseURL); await mobile.locator('#validation-badge').filter({ hasText:'需求不变量通过' }).waitFor({ state: 'attached' });
    assert.equal((await fitsPortrait(mobile)).fits,true);
    assert.ok(Math.abs((await fitsPortrait(mobile)).ratio-9/16)<.001);
    assert.equal(await mobile.locator('.editor-panel').isVisible(),false);
    await mobile.screenshot({ path:directory+'/source-mobile.png',fullPage:true });
    const native=convertSourceLevel(sourceBanks.english.levels[sourceBanks.english.orders.main[0]],{ language:'english',order:'main',position:1 });
    const nativePoints=await centers(native.targets[0].path,mobile);
    const nativeTouch=await mobileContext.newCDPSession(mobile);
    await nativeTouch.send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[nativePoints[0]] });
    for (const point of nativePoints.slice(1)) await nativeTouch.send('Input.dispatchTouchEvent',{ type:'touchMove',touchPoints:[point] });
    await nativeTouch.send('Input.dispatchTouchEvent',{ type:'touchEnd',touchPoints:[] });
    await mobile.locator('.target.completed').filter({ hasText:'ICE' }).waitFor();
    assert.deepEqual((await state(mobile)).completed,['ICE']);
    await openEditor(mobile); await mobile.locator('#algorithm').selectOption('2');
    await mobile.locator('#validation-badge').filter({ hasText:'32 / 32 通过' }).waitFor({ state: 'attached' });
    await mobile.locator('#editor-close').click();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), true);
    await mobile.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
    const points = await centers([1, 4, 7, 8], mobile);
    const session = await mobileContext.newCDPSession(mobile);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (let i = 1; i < 3; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[i]] });
      await mobile.waitForFunction(word => document.querySelector('#current-word').textContent === word, ['F', 'FE', 'FEE'][i]);
    }
    assert.equal(await mobile.locator('#current-word').textContent(), 'FEE');
    assert.deepEqual((await state(mobile)).counts, sample.board.counts);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[3]] });
    await mobile.waitForFunction(() => document.querySelector('#current-word').textContent === 'FEED');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobile.locator('.target.completed').filter({ hasText: 'FEED' }).waitFor();
    assert.deepEqual((await state(mobile)).completed, ['FEED']);
    await openEditor(mobile); await mobile.locator('#seed').fill('20261010'); await mobile.locator('#generate-seed').click();
    await mobile.locator('#notice').filter({hasText:'生成成功'}).waitFor({ state: 'attached' });
    assert.deepEqual((await state(mobile)).counts,fixture.initialCounts);
    for(const target of [...fixture.targets].reverse()) {
      const cells=await centers(target.canonicalPath,mobile);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cells[0]]});
      for(const point of cells.slice(1)) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    assert.deepEqual((await state(mobile)).counts,Array(9).fill(0));
    assert.equal((await fitsPortrait(mobile)).fits,true);
    await mobile.screenshot({path:directory+'/algorithm-v1-mobile-completed.png',fullPage:true});
    await mobileContext.close();
  });
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: cases.length, failed: 0, pageErrors: errors, cases, screenshots: ['source-desktop.png','source-mobile.png','source-completed.png','source-18-targets.png','source-long-word.png','desktop.png','mobile.png','completed.png','algorithm-v1-generated.png','algorithm-v1-completed.png','algorithm-v1-mobile-completed.png'] }, null, 2) + '\n');
  console.log(`Browser acceptance: ${cases.length} passed, no page errors.`);
} catch (error) {
  await page.screenshot({ path: `${directory}/browser-failure.png`, fullPage: true });
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: cases.length, failed: 1, cases, errors, failure: error.stack }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
