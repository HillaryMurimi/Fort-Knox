import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://localhost:3102';
const output = 'test-results/workspace-scenes';
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const cases = [
  ['LANDLORD', '/dashboard', 'Portfolio view', 1280, 900],
  ['PROPERTY_MANAGER', '/manager', 'Property operations', 1280, 900],
  ['CARETAKER', '/caretaker', 'On-site view', 1280, 900],
  ['CONTRACTOR', '/contractor', 'Service view', 1280, 900],
  ['TENANT', '/tenant', 'Your home', 1280, 900],
  ['TENANT', '/tenant', 'Your home', 390, 844],
];

try {
  const results = [];
  for (const [role, route, label, width, height] of cases) {
    console.log(`Checking ${role} at ${width}px`);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.locator('#development-role').waitFor({ timeout: 30000 });
    await page.locator('#development-role').selectOption(role);
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const scene = page.locator(`section[aria-label="${label} illustration"]`);
    await scene.waitFor({ timeout: 30000 });
    await page.addStyleTag({ content: 'aside[aria-label="Development authentication controls"] { display: none !important; }' });
    await scene.scrollIntoViewIfNeeded();
    const canvas = scene.locator('canvas');
    await canvas.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1800);
    const first = await canvas.screenshot();
    const pixels = await sharp(first).resize(48, 48).raw().toBuffer({ resolveWithObject: true });
    const levels = Array.from({ length: 48 * 48 }, (_, index) => {
      const at = index * pixels.info.channels;
      return (pixels.data[at] + pixels.data[at + 1] + pixels.data[at + 2]) / 3;
    });
    await page.waitForTimeout(1700);
    const later = await sharp(await canvas.screenshot()).resize(48, 48).raw().toBuffer();
    const motion = pixels.data.reduce((sum, value, index) => sum + Math.abs(value - later[index]), 0) / pixels.data.length;
    const result = {
      role, width, route,
      brightnessRange: Math.round(Math.max(...levels) - Math.min(...levels)),
      motion: Number(motion.toFixed(2)),
      contextLost: await canvas.evaluate((element) => element.getContext('webgl2')?.isContextLost() ?? true),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      errors,
    };
    await scene.screenshot({ path: `${output}/${role.toLowerCase()}-${width}.png` });
    results.push(result);
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.brightnessRange < 35 || result.contextLost || result.overflow || result.errors.length || result.motion < 0.1)) process.exitCode = 1;
} finally {
  await browser.close();
}
