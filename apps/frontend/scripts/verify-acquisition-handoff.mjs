import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { assertLandingLayout } from './landing-layout-checks.mjs';

const origin = process.env.ACQUISITION_TEST_ORIGIN ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, ...(process.env.PCC_BROWSER_EXECUTABLE ? { executablePath: process.env.PCC_BROWSER_EXECUTABLE } : {}) });

const fixture = (available, units, months) => {
  const quote = (key, base, perUnit) => ({
    key, name: key === 'CONTROL' ? 'Control' : 'Fort Knox', features: ['finance'],
    pricing: { planKey: key, currency: 'KES', unitCount: units, prepaidMonths: months,
      includedUnits: 50, extraUnits: Math.max(0, units - 50), baseMonthlyMinor: base,
      additionalUnitMinor: perUnit, monthlyMinor: base + Math.max(0, units - 50) * perUnit,
      recurringMinor: base + Math.max(0, units - 50) * perUnit,
      billingCycle: 'MONTH', intervalMonths: 1,
      totalMinor: (base + Math.max(0, units - 50) * perUnit) * months, taxMinor: 0 },
  });
  return { success: true, data: { plans: [quote('CONTROL', 1000000, 20000), ...(available ? [quote('FORT_KNOX', 3000000, 30000)] : [])],
    unavailablePlans: available ? [] : [{ key: 'FORT_KNOX', name: 'Fort Knox', reason: 'Pricing is not configured.' }],
    minimumPrepaidMonths: 3, terms: { taxPolicy: 'No tax calculated.', hardware: 'Hardware excluded.', renewal: 'Per agreement.', cancellation: 'Per agreement.', paymentMethods: 'Paystack.' } } };
};

async function check(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const keyWarnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('same key')) keyWarnings.push(message.text()); });
  await page.route('**/api/v1/acquisition/plans?**', route => {
    const url = new URL(route.request().url());
    return (async () => {
      if (page.url().includes('/signup')) await new Promise(resolve => setTimeout(resolve, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(true, Number(url.searchParams.get('units')), Number(url.searchParams.get('months')))) });
    })();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await assertLandingLayout(page);
  const heroLinks = page.locator('.dt-hero-actions a');
  assert.equal(await heroLinks.first().getAttribute('href'), '/demo');
  assert.equal(await heroLinks.nth(1).getAttribute('href'), '/plans');
  await heroLinks.nth(1).click();
  await page.getByRole('heading', { name: 'Choose your level of control' }).waitFor();
  await page.getByText(/(?:KES|Ksh)\s*10,000\.00/).first().waitFor();
  await page.getByText(/(?:KES|Ksh)\s*30,000\.00/).first().waitFor();
  await page.getByRole('button', { name: 'Select Fort Knox' }).click();
  await page.getByLabel('Planned units').fill('55');
  await page.getByText(/(?:KES|Ksh)\s*11,000\.00/).first().waitFor();
  await page.getByText(/(?:KES|Ksh)\s*31,500\.00/).first().waitFor();
  await page.getByLabel('Initial commitment').selectOption('6');
  await page.getByRole('link', { name: 'Continue with Fort Knox' }).click();
  await page.getByRole('heading', { name: 'Create your Property Command Center' }).waitFor();
  await page.getByText('Checking the current plan price...').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Create account and verify email' }).isDisabled(), true);
  await page.getByText('Initial 6-month estimate').waitFor();
  assert.match(await page.getByRole('link', { name: 'Compare plans' }).getAttribute('href'), /plan=FORT_KNOX&units=55&months=6/);
  await page.getByLabel('Password', { exact: true }).fill('a secure password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
  await page.screenshot({ path: join(tmpdir(), `pcc-acquisition-signup-${viewport.width}.png`), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(keyWarnings, []);
  await page.close();

  const unavailable = await browser.newPage({ viewport });
  await unavailable.route('**/api/v1/acquisition/plans?**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(false, Number(url.searchParams.get('units')), Number(url.searchParams.get('months')))) });
  });
  await unavailable.goto(origin + '/signup?plan=FORT_KNOX&units=55&months=3', { waitUntil: 'domcontentloaded' });
  await unavailable.getByText('This plan is not currently available').waitFor();
  assert.equal(await unavailable.getByRole('button', { name: 'Create account and verify email' }).isDisabled(), true);
  await unavailable.close();

  const changed = await browser.newPage({ viewport });
  await changed.route('**/api/v1/acquisition/plans?**', async route => {
    const url = new URL(route.request().url());
    const onSignup = changed.url().includes('/signup');
    if (onSignup) await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(!onSignup, Number(url.searchParams.get('units')), Number(url.searchParams.get('months')))) });
  });
  await changed.goto(origin + '/plans?plan=FORT_KNOX&units=55&months=3', { waitUntil: 'domcontentloaded' });
  await changed.getByRole('link', { name: 'Continue with Fort Knox' }).click();
  await changed.getByText('Checking the current plan price...').waitFor();
  assert.equal(await changed.getByRole('button', { name: 'Create account and verify email' }).isDisabled(), true);
  await changed.getByText('This plan is not currently available').waitFor();
  assert.equal(await changed.getByRole('button', { name: 'Create account and verify email' }).isDisabled(), true);
  await changed.close();
}

try {
  for (const [width, height] of [[768, 1024], [1366, 600], [1920, 650], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    try { await assertLandingLayout(page); }
    catch (error) { throw new Error(`${width}x${height}: ${error.message}`); }
    await page.close();
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) await check(viewport);
  process.stdout.write('Landing, pricing, signup handoff and unavailable tier passed at 390px and 1440px.\n');
} finally {
  await browser.close();
}
