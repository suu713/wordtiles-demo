import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/huyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const input = { url: 'https://number-connect-level-one.dgpalyer.chatgpt.site/' };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(input.url, { waitUntil: 'networkidle', timeout: 30000 });
  const layout = await page.evaluate(() => ({
    title: document.title, url: location.origin + location.pathname, text: document.body.innerText.slice(0, 1800),
    elements: [...document.querySelectorAll('main,aside,section,canvas,div')].filter(el => el.tagName !== 'DIV' || /game|screen|board|preview|app|wrapper|container/.test(el.className)).slice(0, 40).map(el => {
      const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, class: el.className, x:rect.x, y:rect.y, width:rect.width, height:rect.height, maxWidth:css.maxWidth, aspectRatio:css.aspectRatio, overflow:css.overflow, grid:css.gridTemplateColumns };
    })
  }));
  await writeFile(new URL('../reports/reference-layout.json', import.meta.url), JSON.stringify(layout, null, 2) + '\n');
  await page.screenshot({ path: new URL('../reports/reference-layout.png', import.meta.url).pathname.replace(/^\/(\w:)/,'$1'), fullPage: true });
  console.log(JSON.stringify(layout));
} finally { await browser.close(); }
