import type {
  DocumentRecord,
  MaintenanceRequest,
  NotificationRecord,
  Payment,
  RentCharge,
  Tenant,
  Tenancy,
} from '@/lib/data/resource-types';

const CURRENT_TENANCY_STATUSES: Tenancy['status'][] = ['ACTIVE', 'NOTICE', 'PENDING'];
const OPEN_RENT_STATUSES: RentCharge['status'][] = ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'];
const OPEN_MAINTENANCE_STATUSES: MaintenanceRequest['status'][] = [
  'NEW',
  'TRIAGED',
  'ASSIGNED',
  'QUOTED',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
];

export function selectTenant(tenants: Tenant[], userId?: string): Tenant | undefined {
  if (userId) return tenants.find((tenant) => tenant.userId === userId);
  return tenants.find((tenant) => tenant.status === 'ACTIVE') ?? tenants[0];
}

export function selectCurrentTenancy(tenancies: Tenancy[], tenantId?: string): Tenancy | undefined {
  return tenancies
    .filter((tenancy) => tenancy.tenantId === tenantId && CURRENT_TENANCY_STATUSES.includes(tenancy.status))
    .sort((left, right) => CURRENT_TENANCY_STATUSES.indexOf(left.status) - CURRENT_TENANCY_STATUSES.indexOf(right.status))[0];
}

export function selectTenantRent(charges: RentCharge[], tenancyId?: string): RentCharge[] {
  return charges
    .filter((charge) => charge.tenancyId === tenancyId)
    .sort((left, right) => new Date(right.dueDate).getTime() - new Date(left.dueDate).getTime());
}

export function selectTenantPayments(payments: Payment[], tenancyId?: string): Payment[] {
  return payments
    .filter((payment) => payment.tenancyId === tenancyId)
    .sort((left, right) => paymentDate(right) - paymentDate(left));
}

export function selectTenantMaintenance(
  requests: MaintenanceRequest[],
  tenantId?: string,
  unitId?: string,
): MaintenanceRequest[] {
  return requests
    .filter((request) => request.tenantId === tenantId || (!request.tenantId && request.unitId === unitId))
    .sort((left, right) => recordDate(right) - recordDate(left));
}

export function selectTenantDocuments(
  documents: DocumentRecord[],
  userId?: string,
  unitId?: string,
  propertyId?: string,
): DocumentRecord[] {
  return documents
    .filter((document) => document.status === 'ACTIVE')
    .filter((document) =>
      document.ownerUserId === userId ||
      document.unitId === unitId ||
      (document.visibility === 'TENANT' && (!document.propertyId || document.propertyId === propertyId)),
    )
    .sort((left, right) => recordDate(right) - recordDate(left));
}

export function selectTenantNotifications(notifications: NotificationRecord[], userId?: string): NotificationRecord[] {
  return notifications
    .filter((notification) => !userId || notification.recipientUserId === userId)
    .sort((left, right) => recordDate(right) - recordDate(left));
}

export function outstandingBalance(charges: RentCharge[]): number {
  return charges
    .filter((charge) => OPEN_RENT_STATUSES.includes(charge.status))
    .reduce((total, charge) => total + Math.max(0, charge.balanceAmount), 0);
}

export function nextRentCharge(charges: RentCharge[]): RentCharge | undefined {
  return charges
    .filter((charge) => OPEN_RENT_STATUSES.includes(charge.status) && charge.balanceAmount > 0)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0];
}

export function openMaintenanceCount(requests: MaintenanceRequest[]): number {
  return requests.filter((request) => OPEN_MAINTENANCE_STATUSES.includes(request.status)).length;
}

export function unreadNotificationCount(notifications: NotificationRecord[]): number {
  return notifications.filter((notification) => notification.status !== 'READ').length;
}

function recordDate(record: { createdAt?: string; updatedAt?: string }): number {
  return new Date(record.updatedAt ?? record.createdAt ?? 0).getTime();
}

function paymentDate(payment: Payment): number {
  return new Date(payment.paidAt ?? payment.confirmedAt ?? payment.createdAt ?? 0).getTime();
}
