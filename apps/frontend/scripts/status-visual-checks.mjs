import assert from "node:assert/strict";
export async function assertStatusSurface(page) {
  const failures = await page
    .locator(".status-badge[data-semantic]")
    .evaluateAll((nodes) => {
      const luminance = (rgb) => {
        const values = rgb
          .match(/[0-9.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => v / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      return nodes.flatMap((node) => {
        const css = getComputedStyle(node),
          a = luminance(css.color),
          b = luminance(css.backgroundColor),
          ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const issues = [];
        if (!Number.isFinite(ratio) || ratio < 4.5)
          issues.push("Contrast " + ratio + " " + node.textContent);
        if (!node.textContent.trim()) issues.push("Missing status label");
        if (css.animationName !== "none")
          issues.push("Static status animation");
        return issues;
      });
    });
  assert.deepEqual(
    failures,
    [],
    "Rendered status surfaces must remain accessible",
  );
}
export async function assertDomainStatus(page, status, domain, semantic) {
  const badge = page
    .locator(
      '.status-badge[data-status="' +
        status +
        '"][data-domain="' +
        domain +
        '"][data-semantic="' +
        semantic +
        '"]',
    )
    .first();
  await badge.waitFor();
  assert.ok(
    (await badge.textContent()).trim(),
    "A color always has a readable status label",
  );
}
