import type { MaintenanceRequest } from '@/lib/data/resource-types';

export type ContractorJobFilter = 'ACTIVE' | 'QUOTE' | 'READY' | 'HISTORY';

export function contractorJobActions(status: MaintenanceRequest['status']) {
  return {
    canQuote: status === 'ASSIGNED' || status === 'QUOTED',
    canStart: status === 'APPROVED',
    canComplete: status === 'APPROVED' || status === 'IN_PROGRESS',
    canAddEvidence: !['CLOSED', 'CANCELLED'].includes(status),
  };
}

export function filterContractorJobs(jobs: MaintenanceRequest[], filter: ContractorJobFilter, search: string) {
  const term = search.trim().toLowerCase();
  return jobs.filter((job) => {
    const matchesSearch = !term || `${job.title} ${job.description} ${job.category} ${job.priority}`.toLowerCase().includes(term);
    if (!matchesSearch) return false;
    if (filter === 'QUOTE') return ['ASSIGNED', 'QUOTED'].includes(job.status);
    if (filter === 'READY') return ['APPROVED', 'IN_PROGRESS'].includes(job.status);
    if (filter === 'HISTORY') return ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(job.status);
    return !['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(job.status);
  });
}
