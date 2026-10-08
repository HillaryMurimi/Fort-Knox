import {
  assertStatusSurface,
  assertDomainStatus,
} from "./status-visual-checks.mjs";
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
const children = [];
const deliveredCodes = new Map();
async function deliveredCode(channel) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (deliveredCodes.has(channel)) return deliveredCodes.get(channel);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Test delivery did not reach the private harness");
}
let mongo, browser, page, webState;
const runtimeErrors = [];
const apiPort = Number(process.env.PCC_SALES_TEST_API_PORT ?? 9016),
  webPort = Number(process.env.PCC_SALES_TEST_WEB_PORT ?? 3016),
  origin = "http://127.0.0.1:" + webPort,
  password = randomBytes(24).toString("hex");
function start(cwd, args, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: [
      "ignore",
      "pipe",
      "pipe",
      ...(args.includes("scripts/serve-sales-demo-test.ts") ? ["ipc"] : []),
    ],
  });
  children.push(child);
  child.on("message", (message) => {
    if (message?.type === "PCC_TEST_MFA_DELIVERY")
      deliveredCodes.set(message.channel, message.code);
  });
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
        "/pcc-sales-browser-" +
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
    ["--import", "tsx", "scripts/serve-sales-demo-test.ts"],
    {
      NODE_ENV: "test",
      PORT: String(apiPort),
      MONGODB_URI: mongo.getUri("sales-browser-test"),
      JWT_ACCESS_SECRET:
        "browser-test-access-secret-at-least-thirty-two-characters",
      JWT_REFRESH_SECRET:
        "browser-test-refresh-secret-at-least-thirty-two-characters",
      WEB_ORIGIN: origin,
      PCC_SALES_TEST_PASSWORD: password,
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
      PCC_BROWSER_TEST_BUILD: "sales",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + apiPort + "/api/v1",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "false",
      NEXT_PUBLIC_DEV_DEMO_MODE: "false",
    },
  );
  webState = web;
  await ready(origin + "/login", web);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: [
      "--no-sandbox",
      ...(process.env.PCC_SALES_TEST_SINGLE_PROCESS === "true"
        ? ["--single-process", "--no-zygote"]
        : []),
    ],
  });
  const browserContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  page = await browserContext.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    runtimeErrors.push(error.message);
  });
  await page.goto(origin + "/login");
  await page
    .getByRole("tab", { name: "Email + Password", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("platform-browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole('heading', { name: 'Choose how to verify', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('property-command-center.auth.session')), null);
  const partial = await page.context().newPage();
  await partial.goto(origin + '/platform');
  await partial.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  assert.ok(partial.url().includes('/login'), 'Password-only navigation must not open platform screens');
  await partial.close();
  await page.getByRole('button', { name: "Send SMS code", exact: false }).click();
  await page.getByRole('heading', { name: "Verify your phone", exact: true }).waitFor();
  const incomplete = await page.context().newPage();
  await incomplete.goto(origin + '/platform');
  await incomplete.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  assert.ok(incomplete.url().includes('/login'), 'Pending OTP navigation must not open platform screens');
  await incomplete.close();
  await page.getByLabel("SMS verification code").fill(await deliveredCode("SMS"));
  await page.getByRole('button', { name: "Verify phone and sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto(origin + "/sales-demo");
  await page
    .getByLabel("Prospect / company name")
    .fill("Acacia Discovery Portfolio");
  await page.getByRole("button", { name: "Prepare demo", exact: true }).click();
  await page
    .getByRole("heading", { name: "Acacia Discovery Portfolio", exact: true })
    .waitFor();
  async function action(name) {
    const done = page.waitForResponse(
      (r) => r.url().includes("/commands") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name, exact: true }).click();
    const response = await done;
    assert.equal(response.status(), 200, await response.text());
    return (await response.json()).data;
  }
  await page.getByRole("button", { name: /Outstanding/ }).click();
  await page
    .getByRole("button", { name: "Investigate A01", exact: true })
    .click();
  await page.getByRole("region", { name: "Tenancy investigation" }).waitFor();
  await assertDomainStatus(page, "OVERDUE", "sales", "blocked");
  const paid = await action("Simulate payment");
  await assertDomainStatus(page, "PAID", "sales", "completed");
  assert.equal(paid.summary.outstandingMinor, 46400000);
  assert.equal(paid.summary.overdueTenants, 16);
  await page
    .getByRole("button", { name: /Outstanding/ })
    .filter({ hasText: "464,000" })
    .waitFor();
  await page.getByLabel("Investigate a problem").selectOption("MAINTENANCE");
  await action("Simulate tenant reporting a leak");
  for (const [name, status, semantic] of [
    ["Triage request", "TRIAGED", "processing"],
    ["Assign caretaker / contractor", "ASSIGNED", "processing"],
    ["Submit simulated quotation", "APPROVAL_REQUIRED", "review"],
    ["Approve maintenance", "APPROVED", "success"],
    ["Start work", "IN_PROGRESS", "processing"],
    ["Complete repair", "COMPLETED", "completed"],
  ]) {
    await action(name);
    await assertDomainStatus(page, status, "maintenance", semantic);
    const current = page
      .getByRole("list", { name: "Repair progress" })
      .locator('[aria-current="step"][data-semantic="' + semantic + '"]');
    await current.waitFor();
    assert.ok(
      (await current.textContent()).includes(status.replaceAll("_", " ")),
      "The current pipeline stage follows the saved repair state",
    );
  }
  await page.getByText("COMPLETED", { exact: true }).first().waitFor();
  await action("After evidence");
  await page.getByRole("heading", { name: "Evidence retained" }).waitFor();
  // Critical view: genuine keyboard focus, named controls, labels and no viewport spill.
  const sizes = [
    { width: 1440, height: 1000 },
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
  ];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(t);
    }, theme);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: temporaryRoot + `/pcc-sales-${theme}-${size.width}.png`,
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        "Sales cockpit must fit viewport " +
          JSON.stringify(
            await page.evaluate(() => ({
              width: innerWidth,
              scroll: document.documentElement.scrollWidth,
              nodes: [...document.querySelectorAll("main *")]
                .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 12)
                .map((e) => ({
                  tag: e.tagName,
                  cls: e.className,
                  width: e.getBoundingClientRect().width,
                  text: e.textContent.slice(0, 80),
                })),
            })),
          ),
      );
      await page.screenshot({
        path: temporaryRoot + `/pcc-sales-${theme}-${size.width}.png`,
        fullPage: true,
      });
      await assertStatusSurface(page);
      const unnamed = await page
        .locator("main button:visible")
        .evaluateAll(
          (elements) =>
            elements.filter(
              (e) => !e.textContent.trim() && !e.getAttribute("aria-label"),
            ).length,
        );
      assert.equal(unnamed, 0, "Critical controls require accessible names");
    }
  }
  await page.setViewportSize(sizes[0]);
  await page.getByRole("button", { name: "Reset demo", exact: true }).focus();
  assert.equal(
    await page
      .getByRole("button", { name: "Reset demo", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  await page
    .getByText("Demo restored to its deterministic starting state.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: /Outstanding/ })
    .filter({ hasText: "500,000" })
    .waitFor();
  await page
    .getByRole("button", { name: "Investigate A01", exact: true })
    .click();
  await action("Simulate payment");
  await page
    .getByRole("button", { name: "Start guided pilot", exact: true })
    .click();
  await page
    .getByLabel("Verified owner account email")
    .fill("pilot-browser@example.test");
  await page
    .getByRole("button", {
      name: "Prepare guided pilot workspace",
      exact: true,
    })
    .click();
  await page
    .getByRole("link", { name: "Open prepared pilot workspace" })
    .click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/pilot" && url.searchParams.has("organizationId"),
  );
  await page
    .getByRole("heading", { name: "Acacia Discovery Portfolio", exact: true })
    .waitFor();
  const pilotUrl = page.url();
  const pilotOrg = new URL(pilotUrl).searchParams.get("organizationId");
  assert.ok(
    pilotOrg,
    "The prepared pilot must identify its private organization",
  );
  const csv =
    "propertyName,propertyCode,address,city,propertyType,buildingName,buildingCode,floorName,floorLevel,unitCode,unitType,monthlyRentMinor,depositMinor,openingBalanceMinor,tenantFirstName,tenantLastName,tenantPhone,tenancyStart,tenancyEnd\nAcacia Court,ACACIA,Kilimani,Nairobi,APARTMENT,Block A,A,Ground Floor,0,A01,TWO_BEDROOM,2500000,2500000,1200000,Amina,Wambui,+254711009776,2026-01-01,\n";
  await page.getByLabel("Upload portfolio CSV").setInputFiles({
    name: "portfolio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and import 1 units", exact: true })
    .click();
  await page.getByText("71% ready", { exact: true }).waitFor();
  await page
    .getByText("Investigate your largest outstanding balance", { exact: true })
    .waitFor();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Pilot must fit viewport",
    );
  }
  await page.setViewportSize(sizes[0]);
  await page.goto(origin + "/sales-demo");
  await page
    .getByLabel("Prospect / company name")
    .fill("Nyota Executive Residences");
  await page
    .getByLabel("Primary pain", { exact: true })
    .selectOption("SECURITY");
  await page.getByRole("button", { name: "Prepare demo", exact: true }).click();
  await page
    .getByRole("heading", { name: "Nyota Executive Residences", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /Outstanding/ }).click();
  await page
    .getByRole("button", { name: "Investigate A01", exact: true })
    .click();
  await action("Simulate payment");
  await page.getByLabel("Investigate a problem").selectOption("SECURITY");
  await action("Simulate 02:14 AM security event");
  await action("Retrieve incident evidence");
  await assertDomainStatus(page, "OPEN", "incident", "attention");
  await action("Investigate incident");
  await assertDomainStatus(page, "INVESTIGATING", "incident", "processing");
  await action("Escalate response");
  await assertDomainStatus(page, "ESCALATED", "incident", "blocked");
  await action("Resolve incident");
  await assertDomainStatus(page, "RESOLVED", "incident", "completed");
  await page
    .getByRole("button", { name: "Start guided pilot", exact: true })
    .click();
  await page.getByLabel("Verified owner account email").waitFor();
  await page.goto(origin + "/sales-intelligence");
  await page
    .getByRole("heading", { name: "Which value moments create customers?" })
    .waitFor();
  await page
    .locator("main")
    .getByText("Acacia Discovery Portfolio", { exact: true })
    .waitFor();
  // A separate owner session proves readiness from actual private pilot activity.
  const ownerContext = await browser.newContext({ viewport: sizes[0] });
  const ownerPage = await ownerContext.newPage();
  ownerPage.on("pageerror", (error) => errors.push(error.message));
  await ownerPage.goto(origin + "/login");
  await ownerPage
    .getByRole("tab", { name: "Email + Password", exact: true })
    .click();
  await ownerPage
    .getByLabel("Email", { exact: true })
    .fill("pilot-browser@example.test");
  await ownerPage.getByLabel("Password", { exact: true }).fill(password);
  const ownerLogin = ownerPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await ownerPage
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  const ownerResponse = await ownerLogin;
  assert.equal(ownerResponse.status(), 200);
  const ownerChallenge = (await ownerResponse.json()).data;
  assert.equal(
    ownerChallenge.stepUpRequired,
    true,
    "Password alone must not grant landlord access",
  );
  assert.ok(
    ownerChallenge.challenge.developmentCode,
    "Private test environment must provide its OTP",
  );
  await ownerPage
    .getByLabel("Phone verification code")
    .fill(ownerChallenge.challenge.developmentCode);
  const ownerVerified = ownerPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/verify-step-up") &&
      response.request().method() === "POST",
  );
  await ownerPage
    .getByRole("button", { name: "Enter Command Center", exact: true })
    .click();
  const verifiedResponse = await ownerVerified;
  assert.equal(verifiedResponse.status(), 200);
  const ownerSession = (await verifiedResponse.json()).data;
  assert.ok(
    ownerSession.accessToken && ownerSession.user._id,
    "Owner must finish the normal password and phone proof",
  );
  await ownerPage.waitForURL((url) => url.pathname !== "/login");
  await ownerPage.goto(pilotUrl);
  await ownerPage.getByText("71% ready", { exact: true }).waitFor();
  const reviewed = ownerPage.waitForResponse(
    (response) =>
      response.url().includes("/pilot/insight") &&
      response.request().method() === "POST",
  );
  await ownerPage
    .getByRole("button", { name: "Investigate this exposure", exact: true })
    .click();
  assert.equal((await reviewed).status(), 200);
  await ownerPage.waitForURL((url) => url.pathname !== "/pilot");
  await ownerPage.goto(pilotUrl);
  await ownerPage
    .getByLabel("Staff email", { exact: true })
    .fill("caretaker-browser@example.test");
  await ownerPage
    .getByRole("button", { name: "Prepare staff invitation", exact: true })
    .click();
  await ownerPage.getByText("86% ready", { exact: true }).waitFor();
  const apiBase = "http://127.0.0.1:" + apiPort + "/api/v1";
  const ownerHeaders = { Authorization: "Bearer " + ownerSession.accessToken };
  async function ownerCall(method, path, data) {
    const response = await ownerContext.request.fetch(apiBase + path, {
      method,
      headers: ownerHeaders,
      ...(data ? { data } : {}),
    });
    assert.ok(
      response.ok(),
      `Owner workflow failed: ${method} ${path} (${response.status()})`,
    );
    return (await response.json()).data;
  }
  const units = await ownerCall("GET", `/organizations/${pilotOrg}/units`);
  assert.equal(units.length, 1);
  const repair = await ownerCall(
    "POST",
    `/organizations/${pilotOrg}/maintenance`,
    {
      unitId: units[0]._id,
      title: "Kitchen pipe repair",
      description: "Actual isolated pilot request",
      category: "PLUMBING",
      priority: "HIGH",
    },
  );
  for (const [transition, body] of [
    ["triage", {}],
    ["assign", { assignedToUserId: ownerSession.user._id }],
    ["quote", { quoteAmount: 18000 }],
    ["approve", {}],
    ["progress", { status: "IN_PROGRESS" }],
    ["progress", { status: "COMPLETED", actualAmount: 18000 }],
  ])
    await ownerCall("POST", `/maintenance/${repair._id}/${transition}`, body);
  await ownerPage
    .getByRole("button", { name: "Refresh progress", exact: true })
    .click();
  await ownerPage.getByText("100% ready", { exact: true }).waitFor();
  await ownerPage
    .getByText(
      "Activation milestone reached: your operation is configured and a core workflow is completed.",
      { exact: true },
    )
    .waitFor();
  const progress = await ownerCall(
    "GET",
    `/sales/organizations/${pilotOrg}/pilot`,
  );
  assert.equal(progress.readiness.complete, true);
  assert.equal(progress.value.completedRepairs, 1);
  assert.equal(progress.value.approvalsCompleted, 1);
  assert.equal(progress.value.meaningfulInsights, 2);
  assert.notEqual(
    progress.commercialState,
    "ACTIVE",
    "Readiness must never bypass signed and paid activation",
  );
  await ownerPage
    .getByRole("link", { name: "Review agreement and activation", exact: true })
    .click();
  await ownerPage.waitForURL((url) => url.pathname === "/onboarding");
  await ownerPage
    .getByRole("heading", { name: "Activate your Command Center", exact: true })
    .waitFor();
  await ownerPage
    .getByText("Your prepared property records stay in this workspace.", {
      exact: false,
    })
    .waitFor();
  await ownerContext.close();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify({
      status: "PASSED",
      journeys: [
        "Control state transitions",
        "Fort Knox security and evidence",
        "guided pilot validation, import and owner activation milestone",
        "existing commercial activation handoff without paid-access bypass",
        "sales conversion intelligence",
      ],
      viewports: sizes,
      themes: ["light", "dark"],
      keyboard: true,
      consoleErrors: errors.length,
    }),
  );
} catch (error) {
  if (page) {
    await mkdir(frontend + "/test-results", { recursive: true });
    await page
      .screenshot({
        path: frontend + "/test-results/sales-workflow-failure.png",
        fullPage: true,
      })
      .catch(() => {});
    console.error(
      "Workflow page:",
      page.url(),
      "Runtime errors:",
      runtimeErrors,
    );
  }
  if (browser) {
    for (const [index, tab] of browser
      .contexts()
      .flatMap((c) => c.pages())
      .entries()) {
      console.error(
        "Open tab:",
        index,
        tab.url(),
        await tab.title().catch(() => "Unavailable"),
      );
      await tab
        .screenshot({
          path: frontend + "/test-results/sales-failure-tab-" + index + ".png",
          fullPage: true,
        })
        .catch(() => {});
    }
  }
  if (webState) console.error("Frontend startup:", webState.log().slice(-3000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => {
            child.once("exit", resolve);
            setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 5000);
          }),
    ),
  );
  await mongo?.stop();
}
