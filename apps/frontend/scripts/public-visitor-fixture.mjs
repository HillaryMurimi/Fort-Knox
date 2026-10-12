// Test-only anonymous fixture: allow only public acquisition boundaries, deny privileged APIs.
export function anonymousRefresh(method, url, headers, body) {
  return (
    method === "POST" &&
    new URL(url).pathname === "/api/v1/auth/refresh" &&
    !headers.authorization &&
    !headers.cookie &&
    !body
  );
}
export function publicAcquisition(method, url, headers, body) {
  if (headers.authorization || headers.cookie) return false;
  const target = new URL(url);
  if (
    method === "GET" &&
    target.pathname === "/api/v1/acquisition/plans" &&
    !body
  )
    return [...target.searchParams.keys()].every((key) =>
      ["units", "months"].includes(key),
    );
  if (method !== "POST" || target.pathname !== "/api/v1/acquisition/events")
    return false;
  try {
    const value = JSON.parse(body);
    return (
      value &&
      Object.keys(value).every((key) =>
        ["event", "journeyToken", "planKey", "source"].includes(key),
      ) &&
      [
        "landing_viewed",
        "demo_started",
        "demo_completed",
        "plan_selected",
        "signup_started",
      ].includes(value.event) &&
      (!value.source ||
        ["WEBSITE", "PUBLIC_DEMO", "OUTREACH"].includes(value.source)) &&
      (!value.planKey || ["CONTROL", "FORT_KNOX"].includes(value.planKey)) &&
      (!value.journeyToken || /^[A-Za-z0-9_-]{43}$/.test(value.journeyToken))
    );
  } catch {
    return false;
  }
}
function catalog(url) {
  const p = new URL(url).searchParams,
    units = Number(p.get("units") ?? 5),
    months = Number(p.get("months") ?? 3);
  return {
    plans: ["CONTROL", "FORT_KNOX"].map((key) => ({
      key,
      name: key === "CONTROL" ? "Control" : "Fort Knox",
      features: ["documents"],
      pricing: {
        planKey: key,
        planName: key === "CONTROL" ? "Control" : "Fort Knox",
        currency: "KES",
        billingCycle: "MONTH",
        unitCount: units,
        includedUnits: 50,
        extraUnits: Math.max(0, units - 50),
        baseMonthlyMinor: key === "CONTROL" ? 1000000 : 3000000,
        additionalUnitMinor: 20000,
        monthlyMinor:
          (key === "CONTROL" ? 1000000 : 3000000) +
          Math.max(0, units - 50) * 20000,
        prepaidMonths: months,
        totalMinor:
          ((key === "CONTROL" ? 1000000 : 3000000) +
            Math.max(0, units - 50) * 20000) *
          months,
        taxMinor: 0,
      },
    })),
    minimumPrepaidMonths: 3,
    terms: {
      taxPolicy: "No tax is calculated by the current billing policy.",
      hardware: "Hardware excluded unless agreed.",
      renewal: "As signed.",
      cancellation: "Review agreement.",
      paymentMethods: "Secure Paystack checkout.",
    },
  };
}
export async function publicVisitor(page, baseUrl, attempts, bootstraps = []) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      headers = await request.allHeaders(),
      body = request.postData(),
      method = request.method(),
      url = request.url();
    if (anonymousRefresh(method, url, headers, body)) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": new URL(baseUrl).origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          success: false,
          error: { code: "UNAUTHENTICATED", message: "No visitor session" },
        }),
      });
      bootstraps.push({ method, status: 401 });
      return;
    }
    if (publicAcquisition(method, url, headers, body)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": new URL(baseUrl).origin },
        body: JSON.stringify({
          success: true,
          data:
            method === "GET"
              ? catalog(url)
              : { journeyToken: "a".repeat(43), recorded: true },
        }),
      });
      return;
    }
    attempts.push(method + " " + url);
    await route.abort("blockedbyclient");
  });
}
