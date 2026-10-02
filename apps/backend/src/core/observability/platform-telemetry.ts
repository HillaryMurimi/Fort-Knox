import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import { PlatformMonitorSignal, PlatformHeartbeat } from '../../database/models/PlatformMonitoring.js';
export const monitoringEnvironment = () => env.LAUNCH_READINESS_ENV ?? env.NODE_ENV;
const instance = randomUUID();
let writeFailures = 0;
let lastFailureAt: Date | null = null;
export const telemetryHealth = () => ({ writeFailures, lastFailureAt });
export type SignalKind = 'AUTH_FAILURE' | 'AUTHORIZATION_DENIAL' | 'CROSS_ORGANIZATION_DENIAL' | 'OTP_REQUEST' | 'OTP_VERIFIED' | 'OTP_FAILURE' | 'OTP_LOCKED' | 'SWITCH_DENIED';
export function signalKinds(path: string, status: number, code?: string): SignalKind[] {
  const kinds: SignalKind[] = [];
  if (status === 401) kinds.push('AUTH_FAILURE');
  if (status === 403) kinds.push('AUTHORIZATION_DENIAL');
  if (code === 'CROSS_ORGANIZATION_ACCESS_DENIED' || code === 'ORGANIZATION_ACCESS_DENIED') kinds.push('CROSS_ORGANIZATION_DENIAL');
  if (code === 'OTP_LOCKED') kinds.push('OTP_LOCKED');
  // Switch denial is recorded at the guard, covering HTTP and worker/provider calls once.
  if (/\/auth\/otp\/request$/.test(path) && status < 400) kinds.push('OTP_REQUEST');
  if (/\/auth\/(?:otp\/verify|verify-otp|verify-step-up)$/.test(path)) kinds.push(status < 400 ? 'OTP_VERIFIED' : 'OTP_FAILURE');
  return kinds;
}
export async function recordSignal(kind: SignalKind, scope = 'PLATFORM', now = new Date(), subject = ''): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  try {
    await PlatformMonitorSignal.updateOne({ environment: monitoringEnvironment(), bucket, kind, scope, subject },
      { $inc: { count: 1 }, $min: { firstAt: now }, $max: { lastAt: now },
        $setOnInsert: { expiresAt: new Date(now.getTime() + 7 * 86400_000) } }, { upsert: true });
  } catch {
    writeFailures++; lastFailureAt = now;
    // Do not include request content or credentials in operational logs.
    if (writeFailures === 1 || writeFailures % 100 === 0) logger.warn({ writeFailures }, 'Platform telemetry write failed');
  }
}
export function observePlatformRequest(req: Request, res: Response): void {
  const scope = req.auth?.activeOrganizationId?.toString() ?? 'PLATFORM';
  for (const kind of signalKinds(req.path, res.statusCode, res.locals.monitorErrorCode as string | undefined)) void recordSignal(kind, scope);
}
export async function heartbeat(kind: 'API' | 'WORKER', stopped = false): Promise<void> {
  const now = new Date();
  await PlatformHeartbeat.updateOne({ environment: monitoringEnvironment(), instance },
    { $set: { kind, lastAt: now, expiresAt: new Date(now.getTime() + 3 * 86400_000), ...(stopped ? { stoppedAt: now } : {}) },
      $setOnInsert: { firstAt: now }, ...(!stopped ? { $unset: { stoppedAt: 1 } } : {}) }, { upsert: true });
}
export function startHeartbeat(kind: 'API' | 'WORKER') {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await heartbeat(kind); } catch { logger.warn({ kind }, 'Platform heartbeat write failed'); }
    finally { busy = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30_000); timer.unref();
  return async () => { clearInterval(timer); try { await heartbeat(kind, true); } catch { logger.warn({ kind }, 'Final heartbeat write failed'); } };
}
