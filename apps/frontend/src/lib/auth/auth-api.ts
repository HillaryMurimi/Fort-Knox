import { api } from '../api';

import type {
  AdminMfaResponse,
  LoginResult,
  LoginPayload,
  LoginResponse,
  OtpRequestPayload,
  OtpRequestResponse,
} from '../../types/auth';

/**
 * Authentication API
 *
 * The backend owns:
 * - authentication
 * - OTP verification
 * - session issuance
 * - refresh-token rotation
 * - RBAC
 * - organization membership
 *
 * The frontend only stores the access token and identity metadata.
 *
 * The refresh token is stored by the backend in an httpOnly cookie.
 */

/**
 * Unified login entry point.
 *
 * ADMIN TIER
 * ----------
 * SUPER_ADMIN
 * LANDLORD
 *
 * Email + password
 *       ↓
 * SUPER_ADMIN: choose verified email or SMS OTP
 * LANDLORD: existing SMS STEP_UP OTP
 *
 * FIELD TIER
 * ----------
 * PROPERTY_MANAGER
 * CARETAKER
 * CONTRACTOR
 * TENANT
 *
 * Phone
 *   ↓
 * LOGIN OTP
 */
export function verifyAdminMfa(flowToken: string, channel: 'EMAIL' | 'SMS', code: string) { return api<AdminMfaResponse | LoginResponse>('/auth/admin-mfa/verify', { method: 'POST', authenticated: false, body: JSON.stringify({ flowToken, channel, code }) }); }
export function selectAdminMfaChannel(flowToken: string, channel: 'EMAIL' | 'SMS') { return api<AdminMfaResponse>('/auth/admin-mfa/channel', { method: 'POST', authenticated: false, body: JSON.stringify({ flowToken, channel }) }); }
export function resendAdminMfa(flowToken: string) { return api<AdminMfaResponse>('/auth/admin-mfa/resend', { method: 'POST', authenticated: false, body: JSON.stringify({ flowToken }) }); }

export async function login(
  payload: LoginPayload,
): Promise<LoginResult> {
  return api<LoginResult>(
    '/auth/login',
    {
      method: 'POST',

      /**
       * Login occurs before an access token exists.
       */
      authenticated: false,

      body: JSON.stringify(payload),
    },
  );
}

/**
 * Request a phone LOGIN OTP.
 *
 * This endpoint is useful for field-tier authentication:
 *
 * PROPERTY_MANAGER
 * CARETAKER
 * CONTRACTOR
 * TENANT
 */
export async function requestLoginOtp(
  payload: OtpRequestPayload,
): Promise<OtpRequestResponse> {
  return api<OtpRequestResponse>(
    '/auth/otp/request',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Verify a phone LOGIN OTP.
 *
 * Backend route:
 *
 * POST /auth/verify-otp
 *
 * On successful verification the backend returns:
 *
 * - accessToken
 * - user
 * - roles
 * - memberships
 *
 * The refresh token is NOT returned in JSON.
 * It is written to an httpOnly cookie by the backend.
 */
export async function verifyLoginOtp(
  input: {
    phone: string;
    code: string;
  },
): Promise<LoginResponse> {
  return api<LoginResponse>(
    '/auth/verify-otp',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify(input),
    },
  );
}

/**
 * Verify admin-tier STEP_UP OTP.
 *
 * Backend route:
 *
 * POST /auth/verify-step-up
 *
 * Current backend contract uses:
 *
 * {
 *   email,
 *   code
 * }
 *
 * The OTP is sent to the administrator's registered phone.
 */
export async function verifyStepUp(
  email: string,
  code: string,
): Promise<LoginResponse> {
  return api<LoginResponse>(
    '/auth/verify-step-up',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({
        email,
        code,
      }),
    },
  );
}

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 *
 * JavaScript never reads the refresh token.
 */
export async function refreshAuth(): Promise<LoginResponse> {
  return api<LoginResponse>(
    '/auth/refresh',
    {
      method: 'POST',
      authenticated: false,
    },
  );
}

/**
 * Revoke the current refresh session.
 *
 * The backend clears/revokes the refresh cookie/session.
 */
export async function logoutRequest(): Promise<void> {
  await api<void>(
    '/auth/logout',
    {
      method: 'POST',
      authenticated: false,
    },
  );
}

/**
 * Landlord organization bootstrap.
 *
 * Backend route:
 *
 * POST /auth/bootstrap-landlord
 *
 * Creates the landlord identity and organization context.
 */
export async function bootstrapLandlord(
  payload: unknown,
): Promise<LoginResponse> {
  return api<LoginResponse>(
    '/auth/bootstrap-landlord',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Accept an organization invitation.
 *
 * Backend route:
 *
 * POST /auth/invitations/accept
 *
 * The invitation token establishes the onboarding context.
 *
 * The backend remains authoritative for:
 *
 * - invitation validity
 * - invitation expiration
 * - invited role
 * - organization
 * - property scope
 * - building scope
 * - unit scope
 * - tenancy
 * - phone/email identity
 */
export async function acceptInvitation(
  payload: unknown,
): Promise<LoginResponse> {
  return api<LoginResponse>(
    '/auth/invitations/accept',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify(payload),
    },
  );
}