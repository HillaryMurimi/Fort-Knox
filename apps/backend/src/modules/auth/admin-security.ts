import { createHash, createHmac } from 'node:crypto';
import { RefreshSession } from '../../database/models/RefreshSession.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import type { Types } from 'mongoose';
import type { AuthenticatedUser } from '../../core/types/auth.js';

export interface AuthMetadata { userAgent?: string | undefined; ipAddress?: string | undefined; requestId?: string | undefined; }
export const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
export const contactsHash = (email: string, phone: string) => hashCredential(email.trim().toLowerCase() + '\n' + phone.replace(/[\s()-]/g, ''));
export const adminOtpDigest = (flowId: string, channel: 'EMAIL' | 'SMS', code: string) => createHmac('sha256', env.JWT_REFRESH_SECRET).update('pcc-admin-otp-v1:' + flowId + ':' + channel + ':' + code).digest('hex');
export function authEvidence<T>(value: T | null | undefined): T { if (value == null) throw new AppError(401, 'AUTH_EVIDENCE_MISSING', 'Authentication evidence is missing. Sign in again.'); return value; }
export function maskEmail(email: string) { const [local, domain] = email.split('@'); return (local?.slice(0, 1) ?? '*') + '***@' + (domain ?? '***'); }
export function maskPhone(phone: string) { return phone.startsWith('+') ? phone.slice(0, 4) + ' *** *** **' : '*** *** **'; }
export function describeClient(value?: string) {
  if (!value) return 'Browser/device unavailable';
  const browser = /Edg\//.test(value) ? 'Edge' : /Firefox\//.test(value) ? 'Firefox' : /Chrome\//.test(value) ? 'Chrome' : /Safari\//.test(value) ? 'Safari' : 'Unrecognized browser';
  const device = /iPad|Tablet/i.test(value) ? 'reported tablet' : /Mobile|Android/i.test(value) ? 'reported mobile device' : 'unclassified device';
  return browser + ' / ' + device;
}
export function securityAudit(action: string, userId?: Types.ObjectId, meta: AuthMetadata = {}, metadata: Record<string, unknown> = {}) {
  return AuditService.record({ actorUserId: userId, actorRole: 'SUPER_ADMIN', action: 'auth.super_admin.' + action, resourceType: 'Authentication',
    ...(meta.requestId ? { requestId: meta.requestId.slice(0, 100) } : {}),
    ...(meta.ipAddress ? { ipAddress: meta.ipAddress.slice(0, 100) } : {}),
    ...(meta.userAgent ? { userAgent: describeClient(meta.userAgent) } : {}), metadata });
}
export function assertFreshAdmin(auth: AuthenticatedUser) {
  if (!auth.isPlatformAdmin) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required');
  if (!auth.sessionId || !auth.mfaVerifiedAt || Date.now() - auth.mfaVerifiedAt.getTime() >= env.ADMIN_STEP_UP_SECONDS * 1000)
    throw new AppError(403, 'FRESH_AUTH_REQUIRED', 'Verify your password, email and phone again before this security-sensitive action.');
}
export function assertAuthOrigin(origin: string | undefined, marker: string | undefined) {
  if (origin !== new URL(env.WEB_ORIGIN).origin || marker !== '1')
    throw new AppError(403, 'AUTH_ORIGIN_DENIED', 'Authentication request origin is not permitted');
}

export async function auditAdminSessionDenial(userId: Types.ObjectId, sessionId: string, meta: AuthMetadata, tokenExpired = false) {
  const item = tokenExpired ? null : await RefreshSession.findOne({ _id: sessionId, userId, privileged: true }).lean();
  const now = Date.now();
  const reason = tokenExpired ? 'REFRESH_TOKEN_EXPIRY' : !item ? 'MISSING' : item.revokedAt ? 'REVOKED' :
    !item.absoluteExpiresAt || item.absoluteExpiresAt.getTime() <= now || item.expiresAt.getTime() <= now ? 'ABSOLUTE_EXPIRY' :
    !item.lastActivityAt || item.lastActivityAt.getTime() <= now - env.ADMIN_IDLE_SECONDS * 1000 ? 'IDLE_EXPIRY' : 'SECURITY_EVIDENCE_CHANGED';
  const expired = ['REFRESH_TOKEN_EXPIRY', 'ABSOLUTE_EXPIRY', 'IDLE_EXPIRY'].includes(reason);
  await securityAudit(expired ? 'session_expired' : 'session_access_denied', userId, meta, { reason, sessionId });
}
