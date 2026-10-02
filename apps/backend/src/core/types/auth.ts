import type { Types } from 'mongoose';

export type SystemRoleKey = 'SUPER_ADMIN' | 'LANDLORD' | 'PROPERTY_MANAGER' | 'CARETAKER' | 'CONTRACTOR' | 'TENANT';
export type ScopeType = 'ORGANIZATION' | 'PROPERTY' | 'BUILDING' | 'UNIT' | 'SELF';

export interface AuthenticatedMembership {
  organizationId: Types.ObjectId;
  roleIds: Types.ObjectId[];
  roles: string[];
  permissions: string[];
  scope: {
    allProperties: boolean;
    propertyIds: Types.ObjectId[];
    buildingIds: Types.ObjectId[];
    unitIds: Types.ObjectId[];
  };
}

export interface AuthenticatedUser {
  userId: Types.ObjectId;
  isPlatformAdmin: boolean;
  sessionId?: Types.ObjectId;
  mfaVerifiedAt?: Date;
  memberships: AuthenticatedMembership[];
  activeOrganizationId?: Types.ObjectId;
  readOnlyOrganizationIds?: Types.ObjectId[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      requestId?: string;
    }
  }
}
