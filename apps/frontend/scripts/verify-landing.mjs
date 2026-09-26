import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const output = 'test-results/digital-twin';
const baseUrl = process.argv[2] ?? process.env.LANDING_BASE_URL ?? 'http://localhost:3100';
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const results = [];
  for (const [name, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('.property-scene canvas').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    const canvas = page.locator('.property-scene canvas');
    const canvasBox = await canvas.boundingBox();
    await canvas.screenshot({ path: `${output}/${name}-canvas.png` });
    const contextLost = await canvas.evaluate((element) => element.getContext('webgl2')?.isContextLost() ?? true);
    const pixels = await sharp(await canvas.screenshot()).resize(32, 32).raw().toBuffer({ resolveWithObject: true });
    const brightness = Array.from({ length: 32 * 32 }, (_, index) => {
      const offset = index * pixels.info.channels;
      return (pixels.data[offset] + pixels.data[offset + 1] + pixels.data[offset + 2]) / 3;
    });
    const range = Math.max(...brightness) - Math.min(...brightness);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    await page.getByRole('tab', { name: /Move-ins/i }).click();
    const selected = await page.getByRole('tab', { name: /Move-ins/i }).getAttribute('aria-selected');
    await page.getByRole('button', { name: 'See it in action' }).click();
    const demoOpens = await page.getByRole('dialog').isVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Inside units/i }).click();
    await page.waitForTimeout(1600);
    const closeup = await sharp(await canvas.screenshot()).resize(32, 32).raw().toBuffer();
    const cameraChange = pixels.data.reduce((total, value, index) => total + Math.abs(value - closeup[index]), 0) / pixels.data.length;
    results.push({ name, canvasWidth: canvasBox?.width, canvasHeight: canvasBox?.height, contextLost, brightnessRange: Math.round(range), cameraChange: Math.round(cameraChange), demoOpens, horizontalOverflow, selected, pageErrors: errors });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.pageErrors.length || result.contextLost || !result.demoOpens || result.horizontalOverflow || result.selected !== 'true' || result.brightnessRange < 40 || result.cameraChange < 4 || !result.canvasWidth || !result.canvasHeight)) process.exitCode = 1;
} finally { await browser.close(); }
