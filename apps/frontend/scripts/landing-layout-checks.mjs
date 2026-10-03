import assert from 'node:assert/strict';

export async function assertDemoMetrics(page) {
  const metrics = await page.locator('[data-kind]').first().evaluate((stage) =>
    Array.from(stage.querySelectorAll('small'))
      .filter((label) => ['EXPECTED', 'COLLECTED', 'OCCUPIED', 'OUTSTANDING'].includes(label.textContent.trim()))
      .map((label) => {
        const value = label.parentElement.querySelector('strong'), cell = label.parentElement.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(value);
        const text = range.getBoundingClientRect();
        return { label: label.textContent, value: value.textContent, width: Math.round(cell.width),
          fits: text.left >= cell.left - 1 && text.right <= cell.right + 1 };
      }));
  assert.equal(metrics.length, 3, 'The dashboard or finance scene must show all three complete metrics');
  for (const metric of metrics) assert.ok(metric.fits, `${metric.label} text must fit its own cell: ${metric.value}`);
  return metrics;
}

export async function measureLandingLayout(page) {
  const metrics = await assertDemoMetrics(page);
  const heroLayout = await page.evaluate(() => {
    const hero = document.querySelector('.dt-hero'), controls = document.querySelector('.dt-hero-controls');
    const actions = Array.from(document.querySelectorAll('.dt-hero-actions > *'));
    const bar = controls.getBoundingClientRect(), heroBounds = hero.getBoundingClientRect();
    const clearActions = actions.every((action) => {
      const bounds = action.getBoundingClientRect();
      return bounds.top >= heroBounds.top && bounds.bottom + 16 <= bar.top;
    });
    const main = document.querySelector('.dt-hero-main').getBoundingClientRect();
    const sceneHit = document.elementFromPoint(main.right - 8, main.top + 12);
    const sceneReachable = sceneHit?.tagName === 'CANVAS' && Boolean(sceneHit.closest('.property-scene'));
    return { clearActions, sceneReachable, controlsBlur: getComputedStyle(controls).backdropFilter };
  });
  return { metrics, ...heroLayout };
}

export async function assertLandingLayout(page) {
  await page.locator('.property-scene canvas').waitFor({ timeout: 30000 });
  const layout = await measureLandingLayout(page);
  assert.ok(layout.sceneReachable, 'Non-interactive hero content must let pointer gestures reach the property scene');
  assert.ok(layout.clearActions, 'Scene controls must leave at least 16px below both hero actions');
  assert.equal(layout.controlsBlur, 'none', 'The scene controls must not blur content behind them');
  const actions = page.locator('.dt-hero-actions > *');
  for (const action of await actions.all()) {
    await action.scrollIntoViewIfNeeded();
    const reachable = await action.evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return [[.1, .1], [.9, .1], [.5, .5], [.1, .9], [.9, .9]].every(([x, y]) => {
        const hit = document.elementFromPoint(left + width * x, top + height * y);
        return hit && element.contains(hit);
      });
    });
    assert.ok(reachable, `${await action.innerText()} must be unobstructed across its full clickable area`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return layout;
}
