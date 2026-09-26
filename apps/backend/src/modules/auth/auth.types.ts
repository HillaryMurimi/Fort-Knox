import type { Types } from 'mongoose';
import type { SystemRoleKey } from '../../core/types/auth.js';

export interface AuthenticatedIdentity {
  user: Record<string, unknown>;
  roles: SystemRoleKey[];
  memberships: Array<{
    organizationId: Types.ObjectId;
    roles: SystemRoleKey[];
    permissions: string[];
    scope: {
      allProperties: boolean;
      propertyIds: Types.ObjectId[];
      buildingIds: Types.ObjectId[];
      unitIds: Types.ObjectId[];
    };
  }>;
}
