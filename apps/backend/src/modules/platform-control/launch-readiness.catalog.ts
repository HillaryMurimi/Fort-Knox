import { env } from '../../config/env.js';
export type ConfigurationStatus = 'MISSING' | 'PARTIAL' | 'CONFIGURED' | 'NOT_APPLICABLE';
export const readinessCatalog = [
  { key: 'BUSINESS_REGISTRATION', name: 'Business registration', group: 'Business', needsStaging: false, optional: false, nextAction: 'Record the document approval when received.' },
  { key: 'MPESA', name: 'M-Pesa', group: 'Payments', needsStaging: true, optional: false, nextAction: 'Complete merchant onboarding, callbacks and payment reconciliation tests.' },
  { key: 'PAYSTACK', name: 'Paystack', group: 'Payments', needsStaging: true, optional: false, nextAction: 'Complete merchant approval and prepaid checkout, renewal and settlement acceptance.' },
  { key: 'TWILIO', name: 'SMS / OTP', group: 'Messaging', needsStaging: true, optional: false, nextAction: 'Verify the sender and test OTP delivery and recovery.' },
  { key: 'SENDGRID', name: 'Email', group: 'Messaging', needsStaging: true, optional: false, nextAction: 'Verify the sending domain and test transactional delivery.' },
  { key: 'S3', name: 'Document / evidence storage', group: 'Storage', needsStaging: true, optional: false, nextAction: 'Verify private uploads, scoped downloads and retention controls.' },
  { key: 'CCTV', name: 'CCTV gateway', group: 'Security', needsStaging: true, optional: true, nextAction: 'Verify gateway sessions, camera scope and access auditing for Fort Knox.' },
  { key: 'NVR', name: 'NVR gateway', group: 'Security', needsStaging: true, optional: true, nextAction: 'Verify the configured NVR gateway contract and scoped access.' },
  { key: 'WHATSAPP', name: 'WhatsApp', group: 'Messaging', needsStaging: true, optional: true, nextAction: 'Complete provider approval and permitted message delivery tests.' },
  { key: 'DATABASE', name: 'Database / backup restore', group: 'Assurance', needsStaging: true, optional: false, nextAction: 'Verify replica-set transactions, TLS, backups and a restore drill.' },
  { key: 'SECURITY_ACCEPTANCE', name: 'Security acceptance', group: 'Assurance', needsStaging: true, optional: false, nextAction: 'Review cross-tenant tests, privileged access and unresolved security findings.' },
  { key: 'DEPLOYMENT_ACCEPTANCE', name: 'Deployment acceptance', group: 'Assurance', needsStaging: true, optional: false, nextAction: 'Verify containers, HTTPS, worker recovery and end-to-end staging journeys.' },
] as const;
function presence(values: unknown[]): ConfigurationStatus {
  const count = values.filter(Boolean).length;
  return count === values.length ? 'CONFIGURED' : count === 0 ? 'MISSING' : 'PARTIAL';
}
export function configurationStatus(key: string): ConfigurationStatus {
  switch (key) {
    case 'MPESA': return presence([env.MPESA_CONSUMER_KEY, env.MPESA_CONSUMER_SECRET, env.MPESA_SHORT_CODE, env.MPESA_PASSKEY, env.MPESA_CALLBACK_URL]);
    case 'PAYSTACK': return presence([env.PAYSTACK_SECRET_KEY, env.PAYSTACK_CALLBACK_URL]);
    case 'TWILIO': return presence([env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.SMS_FROM]);
    case 'SENDGRID': return presence([env.SENDGRID_API_KEY, env.EMAIL_FROM]);
    case 'S3': return presence([env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY]);
    case 'CCTV': return presence([env.CCTV_PROVIDER_BASE_URL, env.CCTV_PROVIDER_API_KEY]);
    case 'NVR': return presence([env.NVR_BASE_URL, env.NVR_API_KEY]);
    case 'WHATSAPP': return presence([env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_ACCESS_TOKEN]);
    case 'DATABASE': return presence([env.MONGODB_URI]);
    default: return 'NOT_APPLICABLE';
  }
}
type Review = { onboarding: string; staging: string; responsibleOwner: string; blocker: string; severity: string; verifiedAt?: unknown };
export function readinessIssues(review: Review, configuration: ConfigurationStatus, needsStaging: boolean): string[] {
  const issues: string[] = [];
  if (review.onboarding !== 'APPROVED') issues.push('Approval pending');
  if (configuration !== 'CONFIGURED' && configuration !== 'NOT_APPLICABLE') issues.push('Configuration incomplete');
  if (needsStaging && (review.staging !== 'PASSED' || !review.verifiedAt)) issues.push('Staging not verified');
  if (!review.responsibleOwner) issues.push('Owner unassigned');
  if (review.blocker || review.severity !== 'NONE') issues.push('Unresolved blocker');
  return issues;
}
