import type { Request, Response, NextFunction } from 'express';
import { recordSignal } from '../../core/observability/platform-telemetry.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { AppError } from '../../core/errors/AppError.js';

export async function assertSwitchEnabled(key: string): Promise<void> {
  const control = await PlatformSwitch.findOne({ key }).lean();
  if (!control?.enabled || control.mode !== 'ON') {
    void recordSignal('SWITCH_DENIED', 'PLATFORM', new Date(), key);
    throw new AppError(503, 'SERVICE_DISABLED', 'This operation is currently unavailable for maintenance.');
  }
}

export function platformSwitchGuard(req: Request, _res: Response, next: NextFunction): void {
  const path = req.path;
  let key: string | undefined;
  // Callbacks, reconciliation, authentication recovery, audit and admin controls are never gated here.
  if (req.method === 'POST' && /\/provider-initiate$/.test(path)) key = req.body?.provider === 'MPESA' ? 'MPESA_PAYMENTS' : req.body?.provider === 'PAYSTACK' ? 'PAYSTACK_PAYMENTS' : undefined;
  if (req.method === 'POST' && /\/property-onboarding-requests$/.test(path)) key = 'PROPERTY_SETUP_ASSISTANCE';
  if (req.method === 'POST' && /\/subscription(?:\/recover-checkout)?$/.test(path)) key = 'LANDLORD_ONBOARDING';
  // Camera references are gated in SecurityService after resolving and authorizing the camera.
  // A blanket CCTV route gate would incorrectly disable independently enabled NVRs.
  if (req.method === 'POST' && /\/storage\/signed-url$/.test(path)) key = 'DOCUMENT_STORAGE';
  if (!key) { next(); return; }
  void assertSwitchEnabled(key).then(() => next(), next);
}
