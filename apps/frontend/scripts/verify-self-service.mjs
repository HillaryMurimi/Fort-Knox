import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import ExcelJS from "exceljs";
import { MongoMemoryReplSet } from "../../backend/node_modules/mongodb-memory-server/index.js";
const backend = fileURLToPath(new URL("../../backend", import.meta.url)),
  frontend = fileURLToPath(new URL("..", import.meta.url));
const apiPort = 9026,
  webPort = 3026,
  origin = "http://127.0.0.1:" + webPort,
  children = [],
  codes = new Map(),
  paymentResults = new Map();
const password = randomBytes(24).toString("hex"),
  errors = [],
  results = [];
let mongo, browser, page;
function start(cwd, args, vars, ipc = false) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...vars },
    stdio: ["ignore", "pipe", "pipe", ...(ipc ? ["ipc"] : [])],
  });
  children.push(child);
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  child.on("message", (m) => {
    if (m.type === "PCC_TEST_MFA_DELIVERY") codes.set(m.channel, m.code);
    if (m.type === "PCC_TEST_PAYMENT_RESULT")
      paymentResults.set(m.requestId, m.ok);
  });
  child.on(
    "exit",
    () =>
      void writeFile(
        tmpdir() +
          "/pcc-self-service-browser-" +
          (ipc ? "api" : "web") +
          ".log",
        log,
      ),
  );
  return { child, log: () => log };
}
async function ready(url, state, marker) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    if (state.child.exitCode !== null) throw Error(state.log().slice(-3000));
    if (!marker || state.log().includes(marker)) {
      try {
        if ((await fetch(url)).ok) return;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw Error("Startup timed out " + state.log().slice(-2000));
}
async function privateCode() {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (codes.has("EMAIL")) return codes.get("EMAIL");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Private email fixture delivery missing");
}
async function overflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
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
    ["--import", "tsx", "scripts/serve-self-service-test.ts"],
    {
      NODE_ENV: "test",
      PORT: String(apiPort),
      MONGODB_URI: mongo.getUri("self-service-browser-test"),
      JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
      JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
      WEB_ORIGIN: origin,
      PCC_SALES_TEST_PASSWORD: password,
      LOG_LEVEL: "fatal",
      SMS_ENABLED: "false",
      DOCUMENT_STORAGE_ENABLED: "false",
      ONBOARDING_RECOVERY_ENABLED: "false",
    },
    true,
  );
  await ready(
    "http://127.0.0.1:" + apiPort + "/api/v1/health",
    api,
    "SELF_SERVICE_TEST_READY",
  );
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
      PCC_BROWSER_TEST_BUILD: "self-service",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + apiPort + "/api/v1",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "false",
      NEXT_PUBLIC_DEV_DEMO_MODE: "false",
    },
  );
  await ready(origin + "/plans", web);
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_EXECUTABLE_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  await mkdir(frontend + "/test-results/self-service", { recursive: true });
  for (const [index, width, height] of [
    [0, 390, 844],
    [1, 1440, 1000],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/demo/explore", { waitUntil: "networkidle" });
    await page.locator("[data-ratio]").first().waitFor();
    await overflow(page);
    await page.getByRole("button", { name: "Next scene" }).click();
    await page.locator('[data-kind="dashboard"]').waitFor();
    await page
      .getByRole("link", { name: /Compare plans/i })
      .last()
      .click();
    await page.getByRole("heading", { name: /Choose/i }).waitFor();
    const control = page.getByRole("link", { name: /Continue with Control/i });
    await control.click();
    await page.getByLabel("First name", { exact: true }).fill("Browser");
    await page.getByLabel("Last name", { exact: true }).fill("Owner" + index);
    await page
      .getByLabel("Email", { exact: true })
      .fill("self-owner-" + index + "@example.test");
    await page
      .getByLabel("Phone", { exact: true })
      .fill("+25470000914" + index);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/bootstrap-landlord") &&
        r.request().method() === "POST",
    );
    codes.delete("EMAIL");
    await page
      .getByRole("button", { name: "Create account and verify email" })
      .click();
    const signup = await (await created).json();
    assert.equal(signup.success, true);
    const org = signup.data.organizationId;
    await page
      .getByRole("heading", { name: "Verify your owner email" })
      .waitFor();
    await page.getByLabel(/code/i).fill(await privateCode());
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.waitForURL("**/onboarding");
    await page
      .getByLabel("Registration number or legal identifier")
      .fill("TEST-" + index);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page
      .getByRole("heading", { name: "Choose your operating tier" })
      .waitFor();
    await page
      .getByRole("button", { name: "Generate contract and invoice" })
      .click();
    await page
      .getByLabel("Full signatory name (your electronic signature)")
      .fill("Browser Owner" + index);
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Sign and accept" }).click();
    await page.getByRole("button", { name: "Prepare secure checkout" }).click();
    await page
      .getByRole("link", { name: "Open secure Paystack checkout" })
      .waitFor();
    await overflow(page);
    await page.reload();
    await page
      .getByRole("heading", { name: "Pay your activation invoice" })
      .waitFor();
    assert.equal(
      await page
        .getByText("Your Command Center is active", { exact: true })
        .count(),
      0,
    );
    const requestId = "fixture-" + index;
    api.child.send({
      type: "PCC_TEST_CONFIRM_PAYMENT",
      organizationId: org,
      requestId,
    });
    for (
      let waited = 0;
      waited < 10000 && !paymentResults.has(requestId);
      waited += 100
    )
      await page.waitForTimeout(100);
    assert.equal(paymentResults.get(requestId), true);
    await page
      .getByRole("button", { name: "Verify payment / recover checkout" })
      .click();
    await page.waitForURL("**/get-started");
    await page
      .getByRole("heading", { name: /Your workspace is ready/ })
      .waitFor();
    await overflow(page);
    await page.getByRole("button", { name: /First property/i }).click();
    await page
      .getByLabel("Property name", { exact: true })
      .fill("Browser Portfolio " + index);
    await page
      .getByLabel("Property code", { exact: true })
      .fill("BROWSER" + index);
    await page
      .getByLabel("Location / address", { exact: true })
      .fill("Browser Road");
    const propertyResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/organizations/" + org + "/properties") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Save property/i }).click();
    const savedProperty = (await (await propertyResponse).json()).data;
    assert.equal(savedProperty.code, "BROWSER" + index);
    const book = new ExcelJS.Workbook(),
      units = book.addWorksheet("Units");
    units.addRow([
      "Property name",
      "Property code",
      "Address",
      "City",
      "Unit code",
      "Unit category",
      "Monthly rent (KES)",
    ]);
    units.addRow([
      "Browser Portfolio " + index,
      "BROWSER" + index,
      "Browser Road",
      "Nairobi",
      "bad space",
      "ONE_BEDROOM",
      12500.25,
    ]);
    const bytes = await book.xlsx.writeBuffer();
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "private-customer.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
    await page.getByRole("button", { name: "Validate all rows" }).click();
    await page
      .getByText(/validation issues/i)
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Correct row", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Unit code", { exact: true })
      .fill("A1");
    await page
      .getByRole("button", { name: "Save corrections and validate again" })
      .click();
    await page.getByRole("button", { name: "Validate all rows" }).click();
    await page.getByRole("button", { name: /Confirm.*import/i }).click();
    await page
      .getByText(/Import complete|units confirmed|units imported/i)
      .first()
      .waitFor();
    await page.getByRole("button", { name: "Save and return later" }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Continue to dashboard", exact: true })
      .click();
    await page.locator('main a[href="/dashboard"]').first().click();
    await page.waitForURL("**/dashboard");
    await page
      .getByRole("heading", { name: "Your property workspace is taking shape" })
      .waitFor();
    await page
      .getByText("No financial activity recorded in this period.")
      .waitFor();
    await page
      .getByLabel("Essential setup")
      .waitFor()
      .catch(() => {});
    await overflow(page);
    await page.screenshot({
      path:
        frontend +
        "/test-results/self-service/first-dashboard-" +
        width +
        ".png",
      fullPage: true,
    });
    const text = await page.locator("main").innerText();
    assert.ok(text.includes("12,500.25") === false);
    results.push({
      width,
      signup: true,
      emailVerified: true,
      interruptedCheckout: true,
      providerVerifiedActivation: true,
      manualProperty: true,
      xlsxCorrectionImport: true,
      resume: true,
      realDashboard: true,
      overflow: false,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        journeys: results,
        runtimeErrors: errors,
        recoverySent: 0,
        provider: "isolated signed Paystack fixture; no live payment",
        sms: "OFF",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({
        path: frontend + "/test-results/self-service/failure.png",
        fullPage: true,
      })
      .catch(() => {});
  console.error("Self-service browser failed at", page?.url(), errors);
  if (page)
    console.error((await page.locator("body").innerText()).slice(-3000));
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
            setTimeout(resolve, 10000);
          }),
    ),
  );
  await mongo?.stop();
}
