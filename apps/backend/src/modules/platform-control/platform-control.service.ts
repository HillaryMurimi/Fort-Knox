import mongoose, { Types } from 'mongoose';
import { salesFeatureCatalog, isPlannedSalesFeature } from '../sales/sales-feature.registry.js';
import { env } from '../../config/env.js';
import { validateOtpSwitchChange } from '../auth/otp-policy.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { UpdateSwitchInput } from './platform-control.schemas.js';
import { intelligenceModuleRegistry, isPlannedIntelligenceModule } from './intelligence-module.registry.js';

export const platformSwitchCatalog = [
  ...salesFeatureCatalog.map(([key, name, description]) => [key, 'FEATURE', name, description] as const),
  ['EMAIL_OTP', 'FEATURE', 'Email OTP', 'Email verification for authentication; enabled for the initial launch.'],
  ['SMS_OTP', 'FEATURE', 'SMS OTP', 'Optional SMS authentication; requires verified delivery before activation.'],
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
  ...intelligenceModuleRegistry.map(module => [module.key, 'FEATURE', module.name, module.description] as const),
] as const;

export class PlatformControlService {
  static async ensureCatalog() {
    await Promise.all(platformSwitchCatalog.map(([key, kind, name, description]) => PlatformSwitch.updateOne(
      { key },
      { $setOnInsert: { key, kind, name, description, environment: 'ALL',
        enabled: ['EMAIL_OTP', 'EMAIL_NOTIFICATIONS'].includes(key) && env.EMAIL_ENABLED,
        mode: ['EMAIL_OTP', 'EMAIL_NOTIFICATIONS'].includes(key) && env.EMAIL_ENABLED ? 'ON' : 'OFF',
        reason: ['EMAIL_OTP', 'EMAIL_NOTIFICATIONS'].includes(key) ? 'Initial email authentication channel.' : 'Disabled until release readiness is confirmed.' } },
      { upsert: true },
    )));
  }

  static async list() {
    await this.ensureCatalog();
    const switches = await PlatformSwitch.find({}).sort({ kind: 1, name: 1 }).lean();
    return switches.map(control => ({ ...control, activationBlocked: isPlannedIntelligenceModule(control.key) || isPlannedSalesFeature(control.key) }));
  }

  static async update(auth: AuthenticatedUser, key: string, input: UpdateSwitchInput) {
    AuthorizationService.assertPlatformAdmin(auth);
    if (input.mode === 'ON' && key === 'SALES_CALENDAR') await (await import('../sales/sales-calendar.service.js')).SalesCalendarService.readiness();
    if (input.mode === 'ON' && ['SALES_LIFECYCLE', 'SALES_AUTOLINK'].includes(key)) await (await import('../sales/sales-success-indexes.js')).assertLifecycleIndexes();
    if (input.mode === 'ON' && ['SALES_CAMPAIGNS', 'SALES_TRACKING', 'SALES_ATTRIBUTION'].includes(key)) await (await import('../sales/sales-success-indexes.js')).assertCampaignIndexes();
    if (input.mode === 'ON' && isPlannedSalesFeature(key)) throw new AppError(409, 'SALES_FEATURE_NOT_READY', 'This optional sales capability has not been implemented yet');
    if (input.mode === 'ON' && isPlannedIntelligenceModule(key)) {
      throw new AppError(409, 'INTELLIGENCE_MODULE_NOT_READY', 'This intelligence module has no certified server-side implementation');
    }
    await this.ensureCatalog();
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const existing = await PlatformSwitch.findOne({ key }).session(session);
        if (!existing) throw new AppError(404, 'PLATFORM_SWITCH_NOT_FOUND', 'Platform switch not found');
        if (['EMAIL_OTP', 'SMS_OTP', 'EMAIL_NOTIFICATIONS', 'SMS_NOTIFICATIONS'].includes(key)) await PlatformSwitch.updateOne({ key: 'EMAIL_OTP' }, { $inc: { otpPolicyRevision: 1 } }, { session });
        await validateOtpSwitchChange(key, input.mode, session);
        const before = { mode: existing.mode, enabled: existing.enabled, reason: existing.reason };
        existing.mode = input.mode;
        existing.enabled = input.mode === 'ON';
        existing.reason = input.reason;
        existing.modifiedBy = new Types.ObjectId(auth.userId);
        existing.modifiedAt = new Date();
        await existing.save({ session });
        if (key === 'SALES_LIFECYCLE' && input.mode === 'ON') await (await import('../sales/sales-lifecycle.service.js')).SalesLifecycleService.startMonitor(session, auth.userId);
        if (key === 'SALES_CALENDAR' && input.mode === 'ON') await (await import('../sales/sales-calendar.service.js')).SalesCalendarService.startMonitor(session, auth.userId);
        await AuditService.record({
          actorUserId: new Types.ObjectId(auth.userId),
          actorRole: 'SUPER_ADMIN',
          action: input.mode === 'ON' ? 'platform.switch.enabled' : 'platform.switch.disabled',
          resourceType: 'PlatformSwitch',
          resourceId: existing._id,
          before,
          after: { mode: existing.mode, enabled: existing.enabled, reason: existing.reason },
          metadata: { key: existing.key, kind: existing.kind },
        }, session);
        return existing.toObject();
      });
    } finally {
      await session.endSession();
    }
  }
}
