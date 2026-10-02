export type SystemRoleKey = 'SUPER_ADMIN' | 'LANDLORD' | 'PROPERTY_MANAGER' | 'CARETAKER' | 'CONTRACTOR' | 'TENANT';

export interface AuthMembership {
  organizationId: string;
  roles: SystemRoleKey[];
  permissions: string[];
  scope: { allProperties: boolean; propertyIds: string[]; buildingIds: string[]; unitIds: string[] };
}
export interface AuthUser {
  _id: string; phone: string; email?: string; firstName: string; lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'; isPlatformAdmin: boolean;
  lastLoginAt?: string; verifiedAt?: string; createdAt?: string; updatedAt?: string;
}
export interface AuthIdentity { user: AuthUser; roles: SystemRoleKey[]; memberships: AuthMembership[]; }
export interface OtpRequestPayload { phone: string; }
export interface OtpRequestResponse { phone: string; expiresIn: number; developmentCode?: string; }
export interface OtpVerificationPayload { phone: string; code: string; }
export interface LoginEmailPayload { method: 'email'; email: string; password: string; }
export interface LoginPhonePayload { method: 'phone'; phone: string; }
export type LoginPayload = LoginEmailPayload | LoginPhonePayload;
export interface LoginChallengeResponse { stepUpRequired: true; challenge: OtpRequestResponse; user: AuthUser; }
export interface AdminMfaResponse { mfaRequired: true; flowToken: string; stage: 'EMAIL' | 'SMS'; challenge: { channel: 'EMAIL' | 'SMS'; destination: string; expiresAt: string; resendAt: string; delivery: 'PENDING' | 'SENT' | 'FAILED' }; }
export type LoginResult = LoginChallengeResponse | AdminMfaResponse | LoginResponse;
export interface LoginResponse extends AuthIdentity { accessToken: string; expiresAt: string; securityPolicy?: { idleTimeoutSeconds: number; absoluteTimeoutSeconds: number }; }
export interface StoredAuthSession { accessToken: string; user: AuthUser; roles: SystemRoleKey[]; memberships: AuthMembership[]; authenticatedAt: string; expiresAt?: string; idleTimeoutSeconds?: number; }
