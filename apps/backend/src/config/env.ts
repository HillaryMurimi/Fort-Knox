import 'dotenv/config';
import { z } from 'zod';

const optionalValue = (schema: z.ZodString) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const booleanValue = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LAUNCH_READINESS_ENV: z.preprocess(value => value === '' ? undefined : value, z.enum(['development', 'test', 'staging', 'production']).optional()),
  MONITORING_QUEUE_AGE_SECONDS: z.coerce.number().int().min(60).default(900),
  MONITORING_ONBOARDING_AGE_SECONDS: z.coerce.number().int().min(60).default(86400),
  MONITORING_HEARTBEAT_STALE_SECONDS: z.coerce.number().int().min(60).default(120),
  MONITORING_AUTH_BURST_THRESHOLD: z.coerce.number().int().min(1).default(20),
  MONITORING_DENIAL_THRESHOLD: z.coerce.number().int().min(1).default(5),
  PORT: z.coerce.number().int().positive().default(9000),
  API_PREFIX: z.string().default('/api/v1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_API_URL: optionalValue(z.string().url()),
  GOOGLE_CLIENT_ID: optionalValue(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optionalValue(z.string().min(1)),
  FACEBOOK_CLIENT_ID: optionalValue(z.string().min(1)),
  FACEBOOK_CLIENT_SECRET: optionalValue(z.string().min(1)),
  FACEBOOK_GRAPH_VERSION: z.string().regex(/^v\d+\.0$/).default('v25.0'),
  APPLE_CLIENT_ID: optionalValue(z.string().min(1)),
  APPLE_TEAM_ID: optionalValue(z.string().min(1)),
  APPLE_KEY_ID: optionalValue(z.string().min(1)),
  APPLE_PRIVATE_KEY: optionalValue(z.string().min(1)),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),
  REFRESH_COOKIE_SECURE: booleanValue(false),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  SUPER_ADMIN_PHONE: z.string().min(7).max(40).optional(),
  SUPER_ADMIN_FIRST_NAME: z.string().min(1).max(80).default('Platform'),
  SUPER_ADMIN_LAST_NAME: z.string().min(1).max(80).default('Administrator'),
  MPESA_BASE_URL: z.string().url().default('https://sandbox.safaricom.co.ke'),
  MPESA_CONSUMER_KEY: optionalValue(z.string().min(1)),
  MPESA_CONSUMER_SECRET: optionalValue(z.string().min(1)),
  MPESA_SHORT_CODE: optionalValue(z.string().min(1)),
  MPESA_PASSKEY: optionalValue(z.string().min(1)),
  MPESA_CALLBACK_URL: optionalValue(z.string().url()),
  MPESA_WEBHOOK_SECRET: optionalValue(z.string().min(16)),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  PAYSTACK_SECRET_KEY: optionalValue(z.string().min(1)),
  PAYSTACK_CALLBACK_URL: optionalValue(z.string().url()),
  EMAIL_PROVIDER: z.enum(['SENDGRID']).default('SENDGRID'),
  EMAIL_FROM: optionalValue(z.string().email()),
  SENDGRID_API_KEY: optionalValue(z.string().min(1)),
  SMS_PROVIDER: z.enum(['TWILIO']).default('TWILIO'),
  SMS_FROM: optionalValue(z.string().min(1)),
  TWILIO_ACCOUNT_SID: optionalValue(z.string().min(1)),
  TWILIO_AUTH_TOKEN: optionalValue(z.string().min(1)),
  WHATSAPP_PHONE_NUMBER_ID: optionalValue(z.string().min(1)),
  WHATSAPP_ACCESS_TOKEN: optionalValue(z.string().min(1)),
  CLOUDINARY_CLOUD_NAME: optionalValue(z.string().min(1)),
  CLOUDINARY_API_KEY: optionalValue(z.string().min(1)),
  CLOUDINARY_API_SECRET: optionalValue(z.string().min(1)),
  S3_BUCKET: optionalValue(z.string().min(1)),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: optionalValue(z.string().min(1)),
  S3_SECRET_ACCESS_KEY: optionalValue(z.string().min(1)),
  S3_ENDPOINT: optionalValue(z.string().url()),
  CCTV_PROVIDER_BASE_URL: optionalValue(z.string().url()),
  CCTV_PROVIDER_API_KEY: optionalValue(z.string().min(1)),
  NVR_BASE_URL: optionalValue(z.string().url()),
  NVR_API_KEY: optionalValue(z.string().min(1))
}).superRefine((value, context) => {
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Access and refresh secrets must be different' });
  }

  const paired = (left: keyof typeof value, right: keyof typeof value) => {
    if (Boolean(value[left]) !== Boolean(value[right])) {
      context.addIssue({ code: 'custom', path: [String(right)], message: `${String(left)} and ${String(right)} must be configured together` });
    }
  };
  paired('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN');
  paired('NVR_BASE_URL', 'NVR_API_KEY');
  paired('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
  paired('FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET');
  for (const key of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] as const) paired('APPLE_CLIENT_ID', key);
  if (value.GOOGLE_CLIENT_ID || value.FACEBOOK_CLIENT_ID || value.APPLE_CLIENT_ID) {
    if (!value.PUBLIC_API_URL) context.addIssue({ code: 'custom', path: ['PUBLIC_API_URL'], message: 'Required for social sign-in callbacks' });
    if (value.NODE_ENV === 'production' && !value.PUBLIC_API_URL?.startsWith('https://')) context.addIssue({ code: 'custom', path: ['PUBLIC_API_URL'], message: 'OAuth callbacks require HTTPS in production' });
  }

  if (value.NODE_ENV !== 'production') return;

  const requireValue = (key: keyof typeof value, message = 'Required in production') => {
    if (!value[key]) context.addIssue({ code: 'custom', path: [String(key)], message });
  };
  const requireHttps = (key: keyof typeof value) => {
    const configured = value[key];
    if (typeof configured !== 'string' || !configured.startsWith('https://')) {
      context.addIssue({ code: 'custom', path: [String(key)], message: 'Must use HTTPS in production' });
    }
  };

  if (value.JWT_ACCESS_SECRET.length < 64 || /replace|example|change-me/i.test(value.JWT_ACCESS_SECRET)) {
    context.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Use a unique production secret of at least 64 characters' });
  }
  if (value.JWT_REFRESH_SECRET.length < 64 || /replace|example|change-me/i.test(value.JWT_REFRESH_SECRET)) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Use a unique production secret of at least 64 characters' });
  }
  if (!value.REFRESH_COOKIE_SECURE) {
    context.addIssue({ code: 'custom', path: ['REFRESH_COOKIE_SECURE'], message: 'Must be true in production' });
  }
  requireHttps('WEB_ORIGIN');
  if (/localhost|127\.0\.0\.1/i.test(value.MONGODB_URI)) {
    context.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Production database cannot use localhost' });
  }

  for (const key of ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORT_CODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL'] as const) requireValue(key);
  if (value.MPESA_BASE_URL.includes('sandbox')) context.addIssue({ code: 'custom', path: ['MPESA_BASE_URL'], message: 'Use the Safaricom production API URL' });
  requireHttps('MPESA_CALLBACK_URL');
  requireValue('PAYSTACK_SECRET_KEY');
  requireValue('PAYSTACK_CALLBACK_URL');
  requireHttps('PAYSTACK_CALLBACK_URL');
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMS_FROM', 'SENDGRID_API_KEY', 'EMAIL_FROM'] as const) requireValue(key);
  for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) requireValue(key);
  requireValue('CCTV_PROVIDER_BASE_URL');
  requireValue('CCTV_PROVIDER_API_KEY');
  requireHttps('CCTV_PROVIDER_BASE_URL');
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
