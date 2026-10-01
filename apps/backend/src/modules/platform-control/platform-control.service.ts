import { Types } from 'mongoose';
import { AppError } from '../../core/errors/AppError.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { UpdateSwitchInput } from './platform-control.schemas.js';

const catalog = [
  ['MPESA_PAYMENTS', 'SERVICE', 'M-Pesa payments', 'M-Pesa collection and settlement operations.'],
  ['PAYSTACK_PAYMENTS', 'SERVICE', 'Paystack payments', 'Paystack checkout and subscription payment operations.'],
  ['EMAIL_NOTIFICATIONS', 'SERVICE', 'Email notifications', 'Transactional email delivery.'],
  ['SMS_NOTIFICATIONS', 'SERVICE', 'SMS notifications', 'Transactional SMS and OTP delivery.'],
  ['WHATSAPP_NOTIFICATIONS', 'SERVICE', 'WhatsApp notifications', 'WhatsApp Cloud message delivery.'],
  ['CCTV_GATEWAY', 'SERVICE', 'CCTV gateway', 'Live and playback CCTV gateway operations.'],
  ['NVR_GATEWAY', 'SERVICE', 'NVR gateway', 'Network video recorder operations.'],
  ['DOCUMENT_STORAGE', 'SERVICE', 'Document storage', 'Document and evidence storage operations.'],
  ['LANDLORD_ONBOARDING', 'FEATURE', 'Landlord onboarding', 'Landlord activation and prepaid billing onboarding.'],
  ['PROPERTY_SETUP_ASSISTANCE', 'FEATURE', 'Property setup assistance', 'Guided property, building, floor and unit setup support.'],
  ['TENANT_OTP_LOGIN', 'FEATURE', 'Tenant OTP login', 'Tenant phone OTP authentication.'],
  ['DECISION_INTELLIGENCE', 'FEATURE', 'Decision intelligence', 'Predictive intelligence and decision support surfaces.'],
  ['DECISION_AUTOMATION', 'FEATURE', 'Decision automation', 'Automated operational recommendations and actions.'],
] as const;

export class PlatformControlService {
  static async ensureCatalog() {
    await Promise.all(catalog.map(([key, kind, name, description]) => PlatformSwitch.updateOne(
      { key },
      { $setOnInsert: { key, kind, name, description, environment: 'ALL', enabled: false, mode: 'OFF', reason: 'Disabled until release readiness is confirmed.' } },
      { upsert: true },
    )));
  }

  static async list() {
    await this.ensureCatalog();
    return PlatformSwitch.find({}).sort({ kind: 1, name: 1 }).lean();
  }

  static async update(auth: AuthenticatedUser, key: string, input: UpdateSwitchInput) {
    await this.ensureCatalog();
    const existing = await PlatformSwitch.findOne({ key });
    if (!existing) throw new AppError(404, 'PLATFORM_SWITCH_NOT_FOUND', 'Platform switch not found');
    existing.mode = input.mode;
    existing.enabled = input.mode === 'ON';
    existing.reason = input.reason;
    existing.modifiedBy = new Types.ObjectId(auth.userId);
    existing.modifiedAt = new Date();
    await existing.save();
    await AuditService.record({
      actorUserId: new Types.ObjectId(auth.userId),
      actorRole: 'SUPER_ADMIN',
      action: input.mode === 'ON' ? 'platform.switch.enabled' : 'platform.switch.disabled',
      resourceType: 'PlatformSwitch',
      resourceId: existing._id,
      metadata: { key: existing.key, kind: existing.kind, mode: existing.mode, reason: existing.reason },
    });
    return existing.toObject();
  }
}