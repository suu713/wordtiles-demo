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
const baseURL = process.env.WORDTILES_URL || 'http://localhost:4173';
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
    counts: [...document.querySelectorAll('.tile')].map(tile => tile.querySelector('.tile-pips').childElementCount),
    completed: [...document.querySelectorAll('.target.completed')].map(target => target.dataset.word),
    letters: [...document.querySelectorAll('.tile-letter')].map(letter => letter.textContent),
    seed: document.querySelector('#active-seed').textContent
  }));
}
async function centers(path, target = page) {
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
  await page.locator('#load-sample').click();
  assert.deepEqual((await state()).counts, sample.board.counts);
}
async function exportLevel(name) {
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloadPromise;
  await download.saveAs(`${directory}/${name}.json`);
  return JSON.parse(await readFile(`${directory}/${name}.json`, 'utf8'));
}
try {
  await page.goto(baseURL); await page.locator('#validation-badge').filter({ hasText: '32 / 32 通过' }).waitFor();
  await run('桌面首屏、固定 9 格和默认折叠调试面板', async () => {
    assert.equal(await page.locator('.tile').count(), 9);
    assert.equal(await page.locator('.target').count(), 5);
    assert.equal(await page.locator('#debug').getAttribute('open'), null);
    assert.deepEqual((await state()).counts, sample.board.counts);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
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
    await page.locator('#notice').filter({ hasText: '导入被拒绝' }).waitFor(); assert.deepEqual(await state(), before);
    const ambiguous = structuredClone(sample); ambiguous.board.letters[6] = 'F';
    await page.locator('#import-file').setInputFiles({ name: 'ambiguous.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ambiguous)) });
    await page.waitForFunction(() => document.querySelector('#debug-rejection').textContent.includes('AMBIGUOUS')); assert.deepEqual(await state(), before);
    await page.locator('#import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.locator('#notice').filter({ hasText: '导入失败' }).waitFor(); assert.deepEqual(await state(), before);
    await page.locator('#import-file').setInputFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.locator('#level-kind').filter({ hasText: 'JSON 导入' }).waitFor(); assert.deepEqual((await state()).counts, sample.board.counts);
  });
  await run('真实 Worker 生成，seed 重现同关，导出后再次导入', async () => {
    await page.locator('#seed').fill('browser-acceptance'); await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({ hasText: '生成成功' }).waitFor();
    const first = await exportLevel('generated-export');
    assert.equal(first.seed, 'browser-acceptance');
    await page.locator('#generate-seed').click(); await page.locator('#notice').filter({ hasText: '生成成功' }).waitFor();
    assert.deepEqual(await exportLevel('generated-repeat'), first);
    await page.locator('#import-file').setInputFiles({ name: 'generated.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(first)) });
    await page.locator('#level-kind').filter({ hasText: 'JSON 导入' }).waitFor();
    assert.equal((await state()).seed, first.seed);
    for (const target of first.targets) await drag(target.path);
    assert.deepEqual((await state()).counts, Array(9).fill(0));
  });
  await run('极小预算失败提示明确，棋盘和进度保留', async () => {
    await reset(); await drag([0, 3, 4]); const before = await state();
    await page.locator('#debug summary').click();
    for (const id of ['#budget-attempt', '#budget-tries', '#budget-total']) await page.locator(id).fill('1');
    await page.locator('#generate-seed').click();
    await page.locator('#notice').filter({ hasText: '本次搜索预算内未找到合格关卡' }).waitFor();
    assert.deepEqual(await state(), before);
    await page.locator('#budget-attempt').fill('10000'); await page.locator('#budget-tries').fill('30'); await page.locator('#budget-total').fill('300000');
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
    await page.locator('#generate-seed').click(); await page.locator('#load-sample').click();
    await page.waitForTimeout(700); assert.equal(await page.locator('#level-kind').textContent(), '固定样例');
    assert.deepEqual((await state()).counts, sample.board.counts);
    await page.unroute('**/generator.worker.js');
    await page.locator('#debug summary').click();
  });
  await run('玩法弹窗开关和移动端真实触摸拖动', async () => {
    await page.locator('#rules-button').click(); assert.equal(await page.locator('#rules-dialog').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#rules-dialog').isVisible(), false);
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(baseURL); await mobile.locator('#validation-badge').filter({ hasText: '32 / 32 通过' }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
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
    await mobileContext.close();
  });
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: cases.length, failed: 0, pageErrors: errors, cases, screenshots: ['desktop.png', 'mobile.png', 'completed.png'] }, null, 2) + '\n');
  console.log(`Browser acceptance: ${cases.length} passed, no page errors.`);
} catch (error) {
  await page.screenshot({ path: `${directory}/browser-failure.png`, fullPage: true });
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: cases.length, failed: 1, cases, errors, failure: error.stack }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
