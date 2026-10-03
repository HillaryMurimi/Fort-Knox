import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { publicVisitor } from './public-visitor-fixture.mjs';
import { assertLandingLayout } from './landing-layout-checks.mjs';

const output = 'test-results/digital-twin';
const baseUrl = process.argv[2] ?? process.env.LANDING_BASE_URL ?? 'http://localhost:3100';
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const results = [];
  for (const [theme, name, width, height] of [
    ['dark', 'mobile', 390, 844], ['dark', 'tablet', 768, 1024], ['dark', 'desktop', 1440, 900],
    ['light', 'mobile', 390, 844], ['light', 'tablet', 768, 1024], ['light', 'desktop', 1440, 900],
    ['dark', 'short-laptop', 1366, 600], ['light', 'short-laptop', 1366, 600],
    ['dark', 'short-desktop', 1920, 650], ['light', 'short-desktop', 1920, 650],
    ['dark', 'wide-desktop', 1920, 1080], ['light', 'wide-desktop', 1920, 1080],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [], apiAttempts = [], anonymousBootstraps = [];
    await publicVisitor(page, baseUrl, apiAttempts, anonymousBootstraps);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((selectedTheme) => localStorage.setItem('pmcc.theme', selectedTheme), theme);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction((selectedTheme) => document.documentElement.classList.contains(selectedTheme), theme);
    await page.getByRole('heading', { name: 'Dapinni', level: 1, exact: true }).waitFor();
    const brandHierarchy = await page.evaluate(() => {
      const heading = document.querySelector('#dt-title'), descriptor = document.querySelector('.dt-hero-descriptor');
      return heading && descriptor && parseFloat(getComputedStyle(heading).fontSize) > parseFloat(getComputedStyle(descriptor).fontSize)
        && document.title.startsWith('Dapinni') && document.querySelector('.dt-brand-name')?.textContent === 'Dapinni';
    });
    if (!brandHierarchy) throw new Error('Dapinni must be primary in page identity and responsive visual hierarchy');
    const layout = await assertLandingLayout(page);
    await page.locator('.property-scene canvas').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    const canvas = page.locator('.property-scene canvas');
    const canvasBox = await canvas.boundingBox();
    await canvas.screenshot({ path: `${output}/${theme}-${name}-canvas.png` });
    const contextLost = await canvas.evaluate((element) => element.getContext('webgl2')?.isContextLost() ?? true);
    const pixels = await sharp(await canvas.screenshot()).resize(32, 32).raw().toBuffer({ resolveWithObject: true });
    const brightness = Array.from({ length: 32 * 32 }, (_, index) => {
      const offset = index * pixels.info.channels;
      return (pixels.data[offset] + pixels.data[offset + 1] + pixels.data[offset + 2]) / 3;
    });
    const range = Math.max(...brightness) - Math.min(...brightness);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const overviewBackground = await page.locator('.dt-overview').evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(400);
    const scrolledNavigation = await page.locator('.dt-nav').evaluate((element) => element.classList.contains('dt-nav-scrolled') && getComputedStyle(element).position === 'fixed');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${theme}-${name}.png`, fullPage: true });
    await page.locator('.dt-hero').screenshot({ path: `${output}/${theme}-${name}-hero.png` });
    await page.locator('[data-kind="dashboard"]').screenshot({ path: `${output}/${theme}-${name}-metrics.png` });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('tab', { name: /Move-ins/i }).click();
    const selected = await page.getByRole('tab', { name: /Move-ins/i }).getAttribute('aria-selected');
    await page.getByRole('button', { name: 'See it in action' }).click();
    const demoOpens = await page.getByRole('dialog').isVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Inside units/i }).click();
    await page.waitForTimeout(1600);
    const closeup = await sharp(await canvas.screenshot()).resize(32, 32).raw().toBuffer();
    const cameraChange = pixels.data.reduce((total, value, index) => total + Math.abs(value - closeup[index]), 0) / pixels.data.length;
    await page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` }).click();
    await page.waitForFunction((nextTheme) => document.documentElement.classList.contains(nextTheme), theme === 'dark' ? 'light' : 'dark');
    const toggled = await page.evaluate((nextTheme) => document.documentElement.classList.contains(nextTheme) && localStorage.getItem('pmcc.theme') === nextTheme, theme === 'dark' ? 'light' : 'dark');
    results.push({ theme, name, ...layout, apiAttempts, anonymousSessionsDenied: anonymousBootstraps.length, overviewBackground, scrolledNavigation, canvasWidth: canvasBox?.width, canvasHeight: canvasBox?.height, contextLost, brightnessRange: Math.round(range), cameraChange: Math.round(cameraChange), demoOpens, horizontalOverflow, selected, toggled, pageErrors: errors });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.pageErrors.length || result.apiAttempts.length || result.contextLost || !result.demoOpens || result.horizontalOverflow || result.selected !== 'true' || !result.toggled || !result.scrolledNavigation || result.brightnessRange < 40 || result.cameraChange < 4 || !result.canvasWidth || !result.canvasHeight || (result.theme === 'light' && result.overviewBackground !== 'rgb(244, 241, 235)') || (result.theme === 'dark' && result.overviewBackground !== 'rgb(17, 20, 22)'))) process.exitCode = 1;
} finally { await browser.close(); }
