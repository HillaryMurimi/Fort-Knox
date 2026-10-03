import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { MongoMemoryReplSet } from "../../backend/node_modules/mongodb-memory-server/index.js";
import { MongoInstance } from "../../backend/node_modules/mongodb-memory-server-core/lib/util/MongoInstance.js";
const root = fileURLToPath(new URL("../../..", import.meta.url)),
  backend = fileURLToPath(new URL("../../backend", import.meta.url)),
  frontend = fileURLToPath(new URL("..", import.meta.url));
const prepare = MongoInstance.prototype.prepareCommandArgs;
MongoInstance.prototype.prepareCommandArgs = function () {
  return [
    ...prepare.call(this),
    ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
  ];
};
const temporaryRoot = tmpdir();
const devDemoMode = process.env.PCC_BI_TEST_DEV_DEMO_MODE === "true";
const children = [];
const deliveredCodes = new Map();
async function deliveredCode(channel) { const end = Date.now() + 5000; while (Date.now() < end) { if (deliveredCodes.has(channel)) return deliveredCodes.get(channel); await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Test delivery did not reach the private harness'); }
let mongo, browser, page;
const apiPort = Number(process.env.PCC_BI_TEST_API_PORT ?? 9015),
  webPort = Number(process.env.PCC_BI_TEST_WEB_PORT ?? 3015),
  origin = "http://127.0.0.1:" + webPort,
  password = randomBytes(24).toString("hex");
function start(cwd, args, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe", ...(args.includes("scripts/serve-platform-business-test.ts") ? ["ipc"] : [])],
  });
  children.push(child);
  child.on('message', message => { if (message?.type === 'PCC_TEST_MFA_DELIVERY') deliveredCodes.set(message.channel, message.code); });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  child.on("exit", () => {
    void writeFile(
      temporaryRoot +
        "/pcc-bi-browser-" +
        (cwd.endsWith("backend") ? "api" : "web") +
        ".log",
      log,
    );
  });
  return { child, log: () => log };
}
async function ready(url, processState) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (processState.child.exitCode !== null)
      throw new Error("Test server exited: " + processState.log().slice(-3000));
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Wait for local server startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    "Server startup timed out: " + processState.log().slice(-3000),
  );
}
try {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: process.env.MONGOMS_SYSTEM_BINARY
      ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
      : {},
  });
  const api = start(
    backend,
    ["--import", "tsx", "scripts/serve-platform-business-test.ts"],
    {
      NODE_ENV: "test",
      PORT: String(apiPort),
      MONGODB_URI: mongo.getUri("property-bi-browser-test"),
      JWT_ACCESS_SECRET:
        "browser-test-access-secret-at-least-thirty-two-characters",
      JWT_REFRESH_SECRET:
        "browser-test-refresh-secret-at-least-thirty-two-characters",
      WEB_ORIGIN: origin,
      PCC_BI_TEST_PASSWORD: password,
      LOG_LEVEL: "fatal",
    },
  );
  await ready("http://127.0.0.1:" + apiPort + "/api/v1/health", api);
  const web = start(
    frontend,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    {
      NODE_ENV: "development",
      PCC_BROWSER_TEST_BUILD: "platform",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + apiPort + "/api/v1",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "false",
      NEXT_PUBLIC_DEV_DEMO_MODE: String(devDemoMode),
    },
  );
  await ready(origin + "/login", web);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: [
      "--no-sandbox",
      ...(process.env.PCC_BI_TEST_SINGLE_PROCESS === "true"
        ? ["--single-process", "--no-zygote"]
        : []),
    ],
  });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await browserContext.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/login");
  await page
    .getByRole("tab", { name: "Email + Password", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("platform-browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole('heading', { name: 'Verify your email', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('property-command-center.auth.session')), null);
  const partial = await page.context().newPage();
  await partial.goto(origin + '/platform');
  await partial.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  assert.ok(partial.url().includes('/login'), 'Password-only navigation must not open platform screens');
  await partial.close();
  await page.getByLabel('Email verification code').fill(await deliveredCode('EMAIL'));
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page.getByRole('heading', { name: 'Verify your phone', exact: true }).waitFor();
  const incomplete = await page.context().newPage();
  await incomplete.goto(origin + '/platform');
  await incomplete.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  assert.ok(incomplete.url().includes('/login'), 'Email-only navigation must not open platform screens');
  await incomplete.close();
  await page.getByLabel('SMS verification code').fill(await deliveredCode('SMS'));
  await page.getByRole('button', { name: 'Verify phone and sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login');
  const malformedAnalytics = route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
  await page.route("**/api/v1/platform-control/business-intelligence?*", malformedAnalytics);
  await page.goto(origin + "/platform");
  await page
    .getByRole("heading", { name: "Plan Performance", exact: true })
    .waitFor();
  await page.getByText(/Analytics unavailable: Platform analytics response is incomplete or incompatible/).waitFor();
  assert.equal(await page.getByText("Known contracted MRR", { exact: true }).count(), 0, "Malformed analytics must not render financial totals");
  await page.unroute("**/api/v1/platform-control/business-intelligence?*", malformedAnalytics);
  await page.getByRole("button", { name: "Retry analytics", exact: true }).click();
  await page.getByLabel("Record dataset").selectOption("DEMO");
  await page.getByLabel("Operating period").selectOption("LAST_30_DAYS");
  await page
    .getByText("SIMULATED DEMO DATA. Payments and CCTV observations")
    .waitFor();
  await page.getByRole("button", { name: "Control", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.body.textContent.includes("21,000.00") &&
      document.body.textContent.includes("66,000.00"),
  );
  await page.getByLabel("Plan", { exact: true }).selectOption("CONTROL");
  await page.waitForFunction(
    () => !document.querySelector("tbody")?.textContent.includes("Fort Knox"),
  );
  await page.getByLabel("Plan", { exact: true }).selectOption("ALL");
  const output =
    process.env.PCC_BI_SCREENSHOT_DIR ??
    root + "/apps/frontend/tmp/platform-business-browser";
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + "/performance.png", fullPage: true });
  await page.getByRole("button", { name: /^morning brief$/i }).click();
  await page.getByLabel("Record dataset").selectOption("DEMO");
  await page.getByLabel("Operating period").selectOption("LAST_30_DAYS");
  await page
    .getByRole("button", { name: "Generate Morning Brief", exact: true })
    .click();
  await page.getByText("SIMULATED DEMO BRIEF").waitFor();
  await page.screenshot({
    path: output + "/morning-brief.png",
    fullPage: true,
  });
  await page
    .getByRole("link")
    .filter({ hasText: "Unresolved critical security incidents" })
    .click();
  await page.getByRole("heading", { name: /Drill-down: incidents/i }).waitFor();
  await page.getByText("Simulated access-control incident").first().waitFor();
  await page
    .getByRole("button", { name: "Inspect organization", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: /Drill-down: organizations/i })
    .waitFor();
  await page.getByText("1 matching records").waitFor();
  await page.screenshot({
    path: output + "/organization-drill.png",
    fullPage: true,
  });
  const malformedControl = route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
  for (const [endpoint, tab, retry, heading] of [
    ["monitoring", "monitoring", "Retry monitoring", "Platform monitoring"],
    ["switches", "controls", "Retry controls", "Service and feature controls"],
    ["launch-readiness", "launch readiness", "Retry readiness", "Launch readiness"],
  ]) {
    const pattern = "**/api/v1/platform-control/" + endpoint;
    await page.route(pattern, malformedControl);
    await page.goto(origin + "/platform?tab=" + encodeURIComponent(tab));
    await page.getByRole("button", { name: retry, exact: true }).waitFor();
    await page.unroute(pattern, malformedControl);
    await page.getByRole("button", { name: retry, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  const sidebarLinks = await page.locator("aside nav a").evaluateAll(links => links.map(link => ({ label: link.textContent.trim(), href: link.getAttribute("href") })));
  const headings = { organizations: "Organizations", billing: "Platform Billing", access: "Users & Memberships", operations: "Durable jobs", security: "Integration health", controls: "Service and feature controls", monitoring: "Platform monitoring", "plan performance": "Plan Performance" };
  for (const link of sidebarLinks) {
    await page.locator("aside nav a").filter({ hasText: link.label }).first().click();
    const destination = new URL(link.href, origin);
    await page.waitForURL(url => url.pathname === destination.pathname && url.search === destination.search);
    const tab = destination.searchParams.get("tab");
    if (tab && headings[tab]) await page.getByRole("heading", { name: headings[tab], exact: true }).first().waitFor();
    else await page.locator("main h1").first().waitFor();
  }
  await page.goto(origin + "/platform");
  await page.getByRole("heading", { name: "Plan Performance", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile layout must fit the viewport",
  );
  await page.screenshot({ path: output + "/mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => localStorage.getItem('property-command-center.auth.session')), null, 'Privileged tokens must never enter persistent browser storage');
  const logout = await page.context().request.post('http://127.0.0.1:' + apiPort + '/api/v1/auth/logout', { headers: { Origin: origin, 'X-PCC-Auth': '1' } });
  assert.equal(logout.status(), 200);
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  assert.ok(page.url().includes('/login'), 'Logout must revoke platform access');
  if (devDemoMode) {
    const previewContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await previewContext.addInitScript(() => {
      localStorage.setItem("property-command-center.dev.preview-role", "SUPER_ADMIN");
      localStorage.setItem("property-command-center.dev-auth-role", "SUPER_ADMIN");
    });
    const preview = await previewContext.newPage();
    preview.on("pageerror", error => errors.push(error.message));
    const privilegedRequests = [];
    preview.on("request", request => { if (request.url().includes("/api/v1/platform-control/")) privilegedRequests.push(request.url()); });
    await preview.goto(origin + "/admin");
    await preview.locator("aside nav a").first().waitFor();
    const links = await preview.locator("aside nav a").evaluateAll(elements => elements.map(link => ({ label: link.textContent.trim(), href: link.getAttribute("href") })));
    assert.ok(links.length > 10, "The preview must expose the actual SUPER_ADMIN sidebar");
    for (const link of links) {
      await preview.locator("aside nav a").filter({ hasText: link.label }).first().click();
      const destination = new URL(link.href, origin);
      await preview.waitForURL(url => url.pathname === destination.pathname && url.search === destination.search);
      if (destination.pathname === "/platform") await preview.getByText("Real SUPER_ADMIN sign-in required", { exact: true }).waitFor();
      else if (destination.pathname === "/sales-demo") await preview.getByText("Sales demonstrations require a real authenticated sales or SUPER_ADMIN session. Sign out of development preview and sign in normally.", { exact: true }).waitFor();
      else if (destination.pathname === "/sales-intelligence") await preview.getByText("Sales intelligence requires a real SUPER_ADMIN session.", { exact: true }).waitFor();
      else await preview.locator("main h1").first().waitFor();
    }
    assert.deepEqual(privilegedRequests, [], "Preview tokens must never reach platform-control endpoints");
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.goto(origin + "/platform?tab=controls");
    await preview.getByText("Real SUPER_ADMIN sign-in required", { exact: true }).waitFor();
    assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Preview guidance must fit mobile width");
    await previewContext.close();
  }
  assert.deepEqual(
    errors,
    [],
    "The browser journey must have no uncaught runtime errors",
  );
  process.stdout.write(
    `PASS browser E2E: SUPER_ADMIN password/email OTP/SMS OTP, bypass denial and logout → all sidebar destinations and malformed control-plane recovery → plan comparison/filter → retained Morning Brief → critical action → organization drill-down; desktop/mobile; local demo interception ${devDemoMode ? "enabled" : "disabled"}\n`,
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({
        path: temporaryRoot + "/pcc-bi-browser-failure.png",
        mask: [page.locator('input[type="password"], input[autocomplete="one-time-code"]')],
        fullPage: true,
      })
      .catch(() => {});
    process.stderr.write(
      (await page
        .locator("body")
        .innerText()
        .catch(() => "")) + "\n",
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once("exit", resolve);
          setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 5000).unref();
        }),
    ),
  );
  if (mongo) await mongo.stop();
}
