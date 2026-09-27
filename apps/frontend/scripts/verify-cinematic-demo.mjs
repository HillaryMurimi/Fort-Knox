import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://localhost:3102';
const output = 'test-results/cinematic-demo';
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }), headless: true });
const expectedRatios = { vertical: 9 / 16, landscape: 16 / 9, square: 1, portrait: 4 / 5 };
const results = [];
try {
  for (const [name, path, width, height] of [
    ['live-desktop', '/demo/live', 1440, 900],
    ['explore-mobile', '/demo/explore', 390, 844],
    ['studio-vertical', '/demo/studio?scenario=maintenance&campaign=which-house&ratio=vertical&autoplay=false', 1440, 900],
    ['studio-square', '/demo/studio?scenario=finance&ratio=square&autoplay=false', 1024, 768],
    ['studio-portrait', '/demo/studio?scenario=passport&ratio=portrait&autoplay=false', 1024, 768],
    ['studio-clean', '/demo/studio?scenario=security&ratio=landscape&controls=false&autoplay=true', 1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    const mutations = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && request.url().includes('/api/v1/')) mutations.push(`${request.method()} ${request.url()}`); });
    await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'networkidle' });
    await page.locator('[data-ratio]').first().waitFor();
    if (name === 'live-desktop') await page.getByRole('button', { name: /begin demo/i }).click();
    if (name === 'explore-mobile') await page.getByRole('button', { name: /follow a repair/i }).click();
    if (name === 'studio-vertical') {
      await page.keyboard.press('ArrowRight');
      await page.getByRole('heading', { name: 'A leak starts at home.' }).waitFor();
    }
    await page.waitForTimeout(700);
    const stage = page.locator('[data-ratio]').first();
    await stage.screenshot({ path: `${output}/${name}-stage.png` });
    await page.screenshot({ path: `${output}/${name}-page.png`, fullPage: true });
    const box = await stage.boundingBox();
    const ratio = await stage.getAttribute('data-ratio');
    const aspectError = box && ratio ? Math.abs(box.width / box.height - expectedRatios[ratio]) : 1;
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const heading = await page.locator('h2').first().textContent();
    results.push({ name, heading, stageWidth: box?.width, stageHeight: box?.height, aspectError: Math.round(aspectError * 1000) / 1000, horizontalOverflow, mutations, errors });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((item) => item.errors.length || item.mutations.length || item.horizontalOverflow || !item.stageWidth || !item.stageHeight || item.aspectError > 0.01)) process.exitCode = 1;
} finally { await browser.close(); }
