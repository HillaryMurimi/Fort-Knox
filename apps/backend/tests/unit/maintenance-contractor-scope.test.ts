import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { isMaintenanceAssignedToContractor, mergeEvidenceIds } from '../../src/modules/maintenance/maintenance.service.js';

describe('maintenance contractor scope', () => {
  const userId = new Types.ObjectId();
  const contractorId = new Types.ObjectId();

  it('matches a maintenance assignment through the contractor profile id', () => {
    expect(isMaintenanceAssignedToContractor({ contractorId }, userId, contractorId)).toBe(true);
  });

  it('matches a direct user assignment and rejects another contractor profile', () => {
    expect(isMaintenanceAssignedToContractor({ assignedToUserId: userId }, userId)).toBe(true);
    expect(isMaintenanceAssignedToContractor({ contractorId: new Types.ObjectId() }, userId, contractorId)).toBe(false);
  });

  it('preserves existing evidence and de-duplicates submitted evidence', () => {
    const existing = new Types.ObjectId();
    const added = new Types.ObjectId();
    expect(mergeEvidenceIds([existing], [String(existing), String(added)]).map(String)).toEqual([String(existing), String(added)]);
  });
});
