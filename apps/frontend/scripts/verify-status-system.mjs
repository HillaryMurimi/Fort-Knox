import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const fixture = await readFile(
  new URL("../test-results/status-components.html", import.meta.url),
  "utf8",
);
const output = fileURLToPath(
  new URL("../test-results/status-visual-system/", import.meta.url),
);
await mkdir(output, { recursive: true });
const executablePath =
  process.env.CHROMIUM_EXECUTABLE_PATH ??
  process.env.PCC_BROWSER_EXECUTABLE ??
  (process.platform === "win32"
    ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const cases = [];
try {
  for (const theme of ["light", "dark"])
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [768, 1024],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(
        '<!doctype html><html class="' +
          (theme === "dark" ? "dark" : "") +
          '"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
          fixture +
          "</body></html>",
      );
      const checks = await page.evaluate(() => {
        const luminance = (rgb) => {
          const v = rgb
            .match(/[0-9.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            );
          return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
        };
        const failures = [],
          badges = [...document.querySelectorAll(".status-badge")];
        for (const badge of badges) {
          const style = getComputedStyle(badge),
            a = luminance(style.color),
            b = luminance(style.backgroundColor),
            contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (!Number.isFinite(contrast) || contrast < 4.5)
            failures.push("Contrast " + badge.textContent + " " + contrast);
          if (!badge.textContent.trim()) failures.push("Missing label");
          const rect = badge.getBoundingClientRect(),
            parent = badge.parentElement.getBoundingClientRect();
          if (rect.right > parent.right + 1)
            failures.push("Badge overflows container " + badge.textContent);
          if (style.animationName !== "none")
            failures.push("Static status animates");
        }
        const pipeline = document.querySelector(".workflow-pipeline"),
          nodes = [...pipeline.children];
        if (!nodes.every((node) => node.textContent.trim()))
          failures.push("Missing pipeline labels");
        if (
          nodes.filter((node) => node.getAttribute("aria-current") === "step")
            .length !== 3
        )
          failures.push("Current/blocked/failed semantics missing");
        if (document.documentElement.scrollWidth > innerWidth + 1)
          failures.push("Page overflows");
        if (
          innerWidth < 640 &&
          !nodes.every(
            (node, index) =>
              index === 0 ||
              node.getBoundingClientRect().top >=
                nodes[index - 1].getBoundingClientRect().bottom,
          )
        )
          failures.push("Mobile pipeline does not stack");
        const current = nodes.find(
            (node) => node.dataset.position === "current",
          ),
          future = nodes.find((node) => node.dataset.position === "upcoming");
        if (getComputedStyle(current).boxShadow === "none")
          failures.push("Current stage lacks emphasis");
        if (getComputedStyle(future).borderStyle !== "dashed")
          failures.push("Upcoming stage lacks distinct treatment");
        return {
          failures,
          badges: badges.length,
          positions: nodes.map((node) => node.dataset.position),
        };
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(checks.failures, [], theme + " " + width);
      await page.screenshot({
        path: output + "/" + theme + "-" + width + ".png",
        fullPage: true,
      });
      cases.push({ theme, width, height, ...checks });
      await page.close();
    }
  await writeFile(
    output + "/results.json",
    JSON.stringify({ passed: true, cases }, null, 2),
  );
  console.log(
    "PASS: 12 light/dark desktop/laptop/tablet/mobile cases; computed contrast, labels, current/blocked/failed/skipped stages, mobile stacking, reduced motion and no page overflow.",
  );
} finally {
  await browser.close();
}
