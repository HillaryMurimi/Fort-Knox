import type { Request, Response } from 'express';

interface RouteMetric {
  requests: number;
  errors: number;
  totalDurationMs: number;
}

const metrics = new Map<string, RouteMetric>();
let startedAt = new Date();

function key(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}

export function observeRequest(req: Request, res: Response, durationMs: number): void {
  const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
  const metricKey = key(req.method, route);
  const current = metrics.get(metricKey) ?? { requests: 0, errors: 0, totalDurationMs: 0 };
  current.requests += 1;
  if (res.statusCode >= 500) current.errors += 1;
  current.totalDurationMs += durationMs;
  metrics.set(metricKey, current);
}

export function resetMetrics(): void {
  metrics.clear();
  startedAt = new Date();
}

export function snapshotMetrics() {
  const routes = [...metrics.entries()].map(([route, value]) => ({
    route,
    requests: value.requests,
    errors: value.errors,
    errorRate: value.requests === 0 ? 0 : value.errors / value.requests,
    averageDurationMs: value.requests === 0 ? 0 : value.totalDurationMs / value.requests,
  }));
  const totals = routes.reduce(
    (acc, route) => ({ requests: acc.requests + route.requests, errors: acc.errors + route.errors }),
    { requests: 0, errors: 0 },
  );
  return { startedAt, uptimeSeconds: Math.floor(process.uptime()), totals, routes };
}

export function metricsMiddleware() {
  return (req: Request, res: Response, next: () => void): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      observeRequest(req, res, durationMs);
    });
    next();
  };
}
