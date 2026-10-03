// Test-only anonymous fixture: deny session discovery and fail closed on every other API attempt.
export function anonymousRefresh(method, url, headers, body) {
  return method === 'POST' && new URL(url).pathname === '/api/v1/auth/refresh'
    && !headers.authorization && !headers.cookie && !body;
}
export async function publicVisitor(page, baseUrl, attempts, bootstraps = []) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (anonymousRefresh(request.method(), request.url(), await request.allHeaders(), request.postData())) {
      await route.fulfill({
        status: 401, contentType: 'application/json',
        headers: {
          'access-control-allow-origin': new URL(baseUrl).origin,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED', message: 'No visitor session' } }),
      });
      bootstraps.push({ method: request.method(), status: 401 });
      return;
    }
    attempts.push(`${request.method()} ${request.url()}`);
    await route.abort('blockedbyclient');
  });
}
