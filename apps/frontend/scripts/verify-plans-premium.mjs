import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.PLANS_TEST_ORIGIN ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, ...(process.env.PCC_BROWSER_EXECUTABLE ? { executablePath: process.env.PCC_BROWSER_EXECUTABLE } : {}) });

function catalog(units, months) {
  const plan = (key, base, perUnit, features) => {
    const extraUnits = Math.max(0, units - 50);
    const monthlyMinor = base + extraUnits * perUnit;
    return { key, name: key === 'CONTROL' ? 'Control' : 'Fort Knox', description: '', features,
      pricing: { planKey: key, currency: 'KES', billingCycle: 'MONTH', intervalMonths: 1, unitCount: units,
        includedUnits: 50, extraUnits, baseMonthlyMinor: base, additionalUnitMinor: perUnit, monthlyMinor,
        recurringMinor: monthlyMinor, prepaidMonths: months, totalMinor: monthlyMinor * months, taxMinor: 0 } };
  };
  const common = ['command-center', 'finance', 'maintenance', 'documents', 'notifications'];
  return { success: true, data: { plans: [plan('CONTROL', 1000000, 20000, common), plan('FORT_KNOX', 3000000, 30000, [...common, 'security', 'cctv', 'evidence', 'advanced-reporting'])], unavailablePlans: [], minimumPrepaidMonths: 3,
    terms: { taxPolicy: 'Tax follows the signed invoice.', hardware: 'Hardware is separate.', renewal: 'Monthly renewal after prepayment.', cancellation: 'Per agreement.', paymentMethods: 'Secure Paystack checkout.' } } };
}

try {
  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/acquisition/plans?**', route => {
      const url = new URL(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog(Number(url.searchParams.get('units')), Number(url.searchParams.get('months')))) });
    });
    await page.goto(origin + '/plans', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Choose Your Level of Property Command.' }).waitFor();
    await page.getByText(/(?:KES|Ksh)\s*10,000\.00/).first().waitFor();
    assert.equal(await page.locator('.plans-tier').count(), 2);
    assert.equal(await page.getByLabel('Planned units').inputValue(), '50');
    await page.getByLabel('Planned units').fill('75');
    await page.getByText(/(?:KES|Ksh)\s*15,000\.00/).first().waitFor();
    await page.getByText(/(?:KES|Ksh)\s*37,500\.00/).first().waitFor();
    await page.getByRole('button', { name: 'Select Fort Knox' }).click();
    assert.match(await page.getByRole('link', { name: 'Continue with Fort Knox' }).getAttribute('href'), /plan=FORT_KNOX&units=75&months=3/);
    assert.equal(await page.getByText('Authorized CCTV access').count() > 0, true);
    const comparison = page.getByRole('table');
    assert.deepEqual(await comparison.locator('thead th').allTextContents(), ['Capability', 'Control', 'Fort Knox']);
    assert.equal(await comparison.locator('tr.plan-matrix-exclusive-row').count() >= 3, true);
    const columnsFit = await comparison.evaluate(table => {
      const cells = [...table.querySelectorAll('thead th')];
      return cells[0].getBoundingClientRect().right <= cells[1].getBoundingClientRect().left + 1
        && cells[1].getBoundingClientRect().right <= cells[2].getBoundingClientRect().left + 1
        && table.getBoundingClientRect().width <= innerWidth;
    });
    assert.equal(columnsFit, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: join(tmpdir(), `pcc-plans-premium-${viewport.width}-light.png`), fullPage: true });
    await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: join(tmpdir(), `pcc-plans-premium-${viewport.width}-dark.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write('Premium plans page passed at 320px, 390px, 768px and 1440px in light and dark themes.\n');
} finally {
  await browser.close();
}
