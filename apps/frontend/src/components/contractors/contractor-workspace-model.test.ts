import { describe, expect, it } from 'vitest';
import type { MaintenanceRequest } from '@/lib/data/resource-types';
import { contractorJobActions, filterContractorJobs } from './contractor-workspace-model';

const job = (status: MaintenanceRequest['status'], title: string = status): MaintenanceRequest => ({
  _id: status, organizationId: 'org', propertyId: 'property', buildingId: 'building', floorId: 'floor', unitId: 'unit',
  reportedByUserId: 'reporter', title, description: 'A scoped contractor job', category: 'PLUMBING', priority: 'MEDIUM', status,
  evidenceIds: [], approvalRequired: false,
});

describe('contractor workspace model', () => {
  it('exposes only valid contractor actions for each workflow state', () => {
    expect(contractorJobActions('ASSIGNED')).toMatchObject({ canQuote: true, canStart: false, canComplete: false });
    expect(contractorJobActions('APPROVED')).toMatchObject({ canQuote: false, canStart: true, canComplete: true });
    expect(contractorJobActions('CLOSED')).toEqual({ canQuote: false, canStart: false, canComplete: false, canAddEvidence: false });
  });

  it('groups active, ready, and historical work without exposing unrelated states', () => {
    const jobs = [job('ASSIGNED'), job('APPROVED'), job('IN_PROGRESS'), job('COMPLETED')];
    expect(filterContractorJobs(jobs, 'READY', '')).toHaveLength(2);
    expect(filterContractorJobs(jobs, 'HISTORY', '')).toEqual([jobs[3]]);
    expect(filterContractorJobs(jobs, 'ACTIVE', '')).toHaveLength(3);
  });

  it('searches contractor-visible job content', () => {
    expect(filterContractorJobs([job('ASSIGNED', 'Kitchen mixer')], 'ACTIVE', 'mixer')).toHaveLength(1);
    expect(filterContractorJobs([job('ASSIGNED', 'Kitchen mixer')], 'ACTIVE', 'electrical')).toHaveLength(0);
  });
});
