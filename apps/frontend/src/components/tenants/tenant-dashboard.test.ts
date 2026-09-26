import { describe, expect, it } from 'vitest';
import type { DocumentRecord, MaintenanceRequest, NotificationRecord, RentCharge, Tenant, Tenancy } from '@/lib/data/resource-types';
import {
  nextRentCharge,
  openMaintenanceCount,
  outstandingBalance,
  selectCurrentTenancy,
  selectTenant,
  selectTenantDocuments,
  selectTenantMaintenance,
  unreadNotificationCount,
} from './tenant-dashboard';

const tenant = (id: string, userId: string, status: Tenant['status'] = 'ACTIVE'): Tenant => ({ _id: id, userId, status, organizationId: 'org-1' });
const tenancy = (id: string, tenantId: string, status: Tenancy['status']): Tenancy => ({ _id: id, tenantId, status, organizationId: 'org-1', propertyId: 'property-1', buildingId: 'building-1', floorId: 'floor-1', unitId: 'unit-1', leaseNumber: id, startDate: '2026-01-01', monthlyRent: 40_000, billingDay: 1, noticePeriodDays: 30 });
const charge = (id: string, status: RentCharge['status'], balanceAmount: number, dueDate: string): RentCharge => ({ _id: id, status, balanceAmount, dueDate, organizationId: 'org-1', propertyId: 'property-1', buildingId: 'building-1', floorId: 'floor-1', unitId: 'unit-1', tenantId: 'tenant-1', tenancyId: 'tenancy-1', periodStart: '2026-09-01', periodEnd: '2026-09-30', rentAmount: 40_000, serviceChargeAmount: 0, adjustments: 0, totalAmount: 40_000, paidAmount: 40_000 - balanceAmount, currency: 'KES' });

describe('tenant dashboard selectors', () => {
  it('binds the workspace to the authenticated user instead of another active tenant', () => {
    expect(selectTenant([tenant('tenant-a', 'user-a'), tenant('tenant-b', 'user-b')], 'user-b')?._id).toBe('tenant-b');
    expect(selectTenant([tenant('tenant-a', 'user-a')], 'unknown-user')).toBeUndefined();
  });

  it('prefers an active tenancy over pending or notice records', () => {
    expect(selectCurrentTenancy([tenancy('pending', 'tenant-1', 'PENDING'), tenancy('active', 'tenant-1', 'ACTIVE')], 'tenant-1')?._id).toBe('active');
  });

  it('totals only payable rent and returns the earliest outstanding charge', () => {
    const charges = [charge('paid', 'PAID', 0, '2026-08-01'), charge('later', 'OPEN', 8_000, '2026-10-01'), charge('earlier', 'OVERDUE', 4_000, '2026-09-01')];
    expect(outstandingBalance(charges)).toBe(12_000);
    expect(nextRentCharge(charges)?._id).toBe('earlier');
  });

  it('keeps documents limited to the resident, unit, or tenant-visible property records', () => {
    const base: DocumentRecord = { _id: 'base', organizationId: 'org-1', title: 'File', category: 'OTHER', fileName: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageProvider: 'S3', storageKey: 'key', sha256: 'hash', version: 1, visibility: 'STAFF', status: 'ACTIVE', tags: [] };
    const documents = [
      { ...base, _id: 'owner', ownerUserId: 'user-1' },
      { ...base, _id: 'unit', unitId: 'unit-1' },
      { ...base, _id: 'tenant-property', propertyId: 'property-1', visibility: 'TENANT' as const },
      { ...base, _id: 'other-property', propertyId: 'property-2', visibility: 'TENANT' as const },
      { ...base, _id: 'archived', ownerUserId: 'user-1', status: 'ARCHIVED' as const },
    ];
    expect(selectTenantDocuments(documents, 'user-1', 'unit-1', 'property-1').map((document) => document._id).sort()).toEqual(['owner', 'tenant-property', 'unit']);
  });

  it('includes tenant-owned and unassigned unit maintenance without leaking another tenant request', () => {
    const request = (id: string, tenantId?: string, unitId = 'unit-1'): MaintenanceRequest => ({ _id: id, organizationId: 'org-1', propertyId: 'property-1', buildingId: 'building-1', floorId: 'floor-1', unitId, ...(tenantId ? { tenantId } : {}), reportedByUserId: 'user-1', title: id, description: id, category: 'OTHER', priority: 'MEDIUM', status: 'NEW', evidenceIds: [], approvalRequired: false });
    expect(selectTenantMaintenance([request('own', 'tenant-1'), request('common'), request('other', 'tenant-2')], 'tenant-1', 'unit-1').map((item) => item._id).sort()).toEqual(['common', 'own']);
  });

  it('counts only open requests and unread notifications', () => {
    const requests = ['NEW', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'].map((status, index) => ({ _id: String(index), status } as MaintenanceRequest));
    const notifications = ['DELIVERED', 'SENT', 'READ'].map((status, index) => ({ _id: String(index), status } as NotificationRecord));
    expect(openMaintenanceCount(requests)).toBe(2);
    expect(unreadNotificationCount(notifications)).toBe(2);
  });
});
