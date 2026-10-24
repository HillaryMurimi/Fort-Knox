import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.PLANS_TEST_ORIGIN ?? 'http://127.0.0.1:3037';
const browser = await chromium.launch({ headless: true, ...(process.env.PCC_BROWSER_EXECUTABLE ? { executablePath: process.env.PCC_BROWSER_EXECUTABLE } : {}) });
const results = [];

try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/acquisition/plans?**', async route => {
      const url = new URL(route.request().url());
      const units = Number(url.searchParams.get('units'));
      const months = Number(url.searchParams.get('months'));
      const quote = (key, name, base, features) => {
        const includedUnits = 50, extraUnits = Math.max(0, units - includedUnits);
        const monthlyMinor = base + extraUnits * 20000;
        return { key, name, description: `${name} property operations`, features, pricing: {
          planKey: key, planName: name, currency: 'KES', billingCycle: 'MONTH',
          unitCount: units, includedUnits, extraUnits, baseMonthlyMinor: base,
          additionalUnitMinor: 20000, monthlyMinor, recurringMinor: monthlyMinor,
          intervalMonths: 1, prepaidMonths: months, totalMinor: monthlyMinor * months, taxMinor: 0,
        } };
      };
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, data: {
        plans: [quote('CONTROL', 'Control', 1000000, ['finance', 'maintenance']), quote('FORT_KNOX', 'Fort Knox', 3000000, ['finance', 'maintenance', 'cctv'])],
        minimumPrepaidMonths: 3, terms: { taxPolicy: 'No tax calculated.', hardware: 'Hardware excluded.', renewal: 'Renewal follows the agreement.', cancellation: 'Review the agreement.', paymentMethods: 'Available at secure checkout.' },
      } }) });
    });
    await page.goto(origin + '/plans?plan=CONTROL&units=5&months=3', { waitUntil: 'networkidle' });
    try { await page.getByRole('heading', { name: 'Choose your level of control' }).waitFor({ timeout: 15000 }); }
    catch (error) { throw new Error(`${error.message}\nVisible page: ${(await page.locator('body').innerText()).slice(0, 1000)}\nPage errors: ${errors.join('; ')}`); }
    await page.getByRole('button', { name: 'Select Fort Knox' }).click();
    await page.getByLabel('Planned units').fill('55');
    await page.getByText('Fort Knox for 55 units').waitFor();
    await page.getByLabel('Initial commitment').selectOption('6');
    await page.getByText('Due for 6 months upfront').first().waitFor();
    assert.match(await page.getByRole('link', { name: 'Continue with Fort Knox' }).getAttribute('href'), /plan=FORT_KNOX&units=55&months=6/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    const image = join(tmpdir(), `pcc-plans-${viewport.width}.png`);
    await page.screenshot({ path: image, fullPage: true });
    results.push({ viewport: viewport.width, image });
    await page.close();
  }
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} finally {
  await browser.close();
}
