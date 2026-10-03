import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { assertDemoMetrics } from './landing-layout-checks.mjs';
import { anonymousRefresh, publicVisitor as installPublicVisitor } from './public-visitor-fixture.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const output = 'test-results/cinematic-demo';
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }), headless: true });
const expectedRatios = { vertical: 9 / 16, landscape: 16 / 9, square: 1, portrait: 4 / 5 };
const results = [];
const anonymousBootstraps = [];
// A visitor fixture may deny empty session discovery; it must never mask an authenticated write.
const refreshUrl = 'https://api.example.test/api/v1/auth/refresh';
assert.ok(anonymousRefresh('POST', refreshUrl, {}, null));
for (const [method, url, headers, body] of [
  ['GET', refreshUrl, {}, null], ['POST', refreshUrl, { authorization: 'Bearer fixture' }, null],
  ['POST', refreshUrl, { cookie: 'refresh=fixture' }, null], ['POST', refreshUrl, {}, '{"refreshToken":"fixture"}'],
  ['POST', 'https://api.example.test/api/v1/payments', {}, null],
]) assert.equal(anonymousRefresh(method, url, headers, body), false);
const publicVisitor = (page, mutations) => installPublicVisitor(page, baseUrl, mutations, anonymousBootstraps);
try {
  for (const [theme, width, height] of [['dark', 375, 812], ['light', 375, 812], ['dark', 430, 932], ['light', 430, 932], ['dark', 1024, 768], ['light', 1024, 768], ['dark', 1440, 900], ['light', 1440, 900], ['dark', 1920, 1080], ['light', 1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [], mutations = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await publicVisitor(page, mutations);
    await page.goto(new URL(`/demo/explore?theme=${theme}`, baseUrl).toString(), { waitUntil: 'networkidle' });
    const stage = page.locator('[data-ratio]').first();
    await stage.waitFor();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'Next scene' }).click();
    await page.locator('[data-kind="dashboard"]').waitFor();
    await page.waitForTimeout(900);
    const metrics = await assertDemoMetrics(page);
    await page.getByRole('button', { name: 'Follow a repair' }).click();
    await page.getByRole('button', { name: 'Next scene' }).click();
    await page.waitForTimeout(900);
    const sceneKind = await page.locator('[data-kind]').first().getAttribute('data-kind');
    const stageTheme = await page.locator('[data-kind]').first().getAttribute('data-theme');
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: `${output}/${theme}-${width}-page.png`, fullPage: true });
    const box = await stage.boundingBox();
    const ratio = await stage.getAttribute('data-ratio');
    const aspectError = box && ratio ? Math.abs(box.width / box.height - expectedRatios[ratio]) : 1;
    results.push({ name: `${theme}-${width}`, metrics, stageTheme, sceneKind, stageWidth: box?.width, aspectError, horizontalOverflow, mutations, errors });
    await page.close();
  }
  for (const [ratio, scenario] of [['vertical', 'maintenance'], ['square', 'rent'], ['portrait', 'passport'], ['landscape', 'security']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], mutations = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await publicVisitor(page, mutations);
    await page.goto(new URL(`/demo/studio?scenario=${scenario}&ratio=${ratio}&theme=light`, baseUrl).toString(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (scenario === 'rent') {
      await page.getByRole('button', { name: 'Next scene' }).click();
      await page.locator('[data-kind="finance"]').waitFor();
      await page.getByRole('heading', { name: 'Money in motion.' }).waitFor();
      await assertDemoMetrics(page);
    }
    const frame = page.locator('[data-ratio]').first();
    const box = await frame.boundingBox();
    const aspectError = box ? Math.abs(box.width / box.height - expectedRatios[ratio]) : 1;
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: `${output}/studio-${ratio}.png`, fullPage: true });
    results.push({ name: `studio-${ratio}`, stageTheme: await page.locator('[data-kind]').first().getAttribute('data-theme'), stageWidth: box?.width, aspectError, horizontalOverflow, mutations, errors });
    await page.close();
  }
  const interaction = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const interactionErrors = [], interactionMutations = [];
  interaction.on('pageerror', (error) => interactionErrors.push(error.message));
  await publicVisitor(interaction, interactionMutations);
  await interaction.goto(new URL('/demo/explore?scenario=roles', baseUrl).toString(), { waitUntil: 'networkidle' });
  await interaction.getByRole('tab', { name: 'CARETAKER' }).click();
  const caretakerSelected = await interaction.getByRole('tab', { name: 'CARETAKER' }).getAttribute('aria-selected');
  const caretakerScope = await interaction.getByText('Riverside Apartments', { exact: true }).first().isVisible();
  const ownerPortfolioHidden = await interaction.getByText('Five-property portfolio', { exact: true }).count() === 0;
  await interaction.getByRole('button', { name: 'Switch theme' }).click();
  const switchedTheme = await interaction.locator('[data-kind]').first().getAttribute('data-theme');
  await interaction.keyboard.press('c');
  const cleanView = await interaction.getByRole('button', { name: 'Exit clean view' }).isVisible();
  await interaction.close();
  const approval = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  approval.on('pageerror', (error) => interactionErrors.push(error.message));
  await publicVisitor(approval, interactionMutations);
  await approval.goto(new URL('/demo/explore?scenario=approval', baseUrl).toString(), { waitUntil: 'networkidle' });
  await approval.getByRole('button', { name: 'Next scene' }).click();
  await approval.getByRole('button', { name: 'Approve KES 27,500' }).click();
  const approvalSimulated = await approval.getByRole('button', { name: 'Simulated approval' }).isVisible();
  await approval.close();
  const homeResults = [];
  for (const [theme, width] of [['dark', 375], ['light', 375], ['dark', 1440], ['light', 1440]]) {
    const home = await browser.newPage({ viewport: { width, height: 900 } });
    await publicVisitor(home, interactionMutations);
    await home.addInitScript((selectedTheme) => localStorage.setItem('pmcc.theme', selectedTheme), theme);
    await home.goto(new URL('/demo', baseUrl).toString(), { waitUntil: 'networkidle' });
    const overflow = await home.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const hasScenario = await home.getByRole('link', { name: /The Command Center/ }).isVisible();
    await home.screenshot({ path: `${output}/home-${theme}-${width}.png`, fullPage: true });
    homeResults.push({ theme, width, overflow, hasScenario });
    await home.close();
  }
  console.log(JSON.stringify({ anonymousBootstraps, caretakerSelected, caretakerScope, ownerPortfolioHidden, switchedTheme, cleanView, approvalSimulated, interactionErrors, interactionMutations }));
  console.log(JSON.stringify(homeResults));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((item) => item.errors.length || item.mutations.length || item.horizontalOverflow || !item.stageWidth || item.aspectError > .01 || item.stageTheme !== (item.name.startsWith('dark') ? 'dark' : 'light') || (item.sceneKind && item.sceneKind !== 'context')) || homeResults.some((item) => item.overflow || !item.hasScenario) || caretakerSelected !== 'true' || !caretakerScope || !ownerPortfolioHidden || switchedTheme !== 'light' || !cleanView || !approvalSimulated || interactionErrors.length || interactionMutations.length) process.exitCode = 1;
} finally { await browser.close(); }
