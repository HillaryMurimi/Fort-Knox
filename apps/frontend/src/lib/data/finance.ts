import { api } from '../api';
import type { ArrearsCase, Expense, FinancialPeriod, FinancialReport, Payment, PaymentDestination, PaymentRefund, RentCharge, ServiceChargeAssessment } from './resource-types';
import { toQueryString, type QueryValue } from './query-params';

export interface RentChargeInput { tenancyId: string; periodStart: string; periodEnd: string; dueDate: string; rentAmount: number; serviceChargeAmount?: number; adjustments?: number; currency?: string; notes?: string; }
export interface GenerateRentInput { periodStart: string; periodEnd: string; dueDate: string; currency?: string; }
export interface PaymentInput { tenancyId: string; amount: number; currency?: string; method: Payment['method']; notes?: string; }
export interface PaymentClaimInput { tenancyId: string; amount: number; currency?: string; method: Payment['method']; paidAt: string; transactionReference?: string; receivingAccount?: string; evidenceIds?: string[]; idempotencyKey: string; }
export interface TenancyPaymentInstructions { methods: Array<{ provider:'MPESA'; destinationId:string; label:string; businessType:'PAYBILL'|'TILL'; shortCode:string; accountReference:string|null; currency:string; verification:'OWNER_ATTESTED'; canInitiateStk:boolean }> }
export type PaymentDestinationInput =
  | { provider:'PAYSTACK';label:string;isDefault?:boolean;country?:string;currency?:string;businessName:string;bankCode:string;accountNumber:string;percentageCharge?:number;contactEmail?:string;contactPhone?:string }
  | { provider:'MPESA';label:string;isDefault?:boolean;country?:string;currency?:'KES';propertyId?:string;businessType:'PAYBILL'|'TILL';ownershipAttested:true;shortCode:string;accountReference?:string }
  | { provider:'CRYPTO';label:string;isDefault?:boolean;country?:string;currency?:string;asset:'USDC'|'USDT'|'BTC'|'ETH';network:'BASE'|'ETHEREUM'|'POLYGON'|'BITCOIN';walletAddress:string };
export interface AllocationInput { allocations: Array<{ rentChargeId: string; amount: number }>; verification: { checkedReceivingAccount: true; basis: string } }
export interface ExpenseInput { propertyId: string; buildingId?: string; floorId?: string; unitId?: string; category: Expense['category']; description: string; amount: number; currency?: string; incurredAt: string; vendorName?: string; contractorId?: string; evidenceIds?: string[]; notes?: string; }
export interface ServiceChargeInput { tenancyId: string; periodStart: string; periodEnd: string; amount: number; currency?: string; description?: string; }
export interface ArrearsUpdateInput { status: Exclude<ArrearsCase['status'], 'OPEN'>; promiseDate?: string; notes?: string; }
export interface FinancialPeriodInput { periodStart: string; periodEnd: string; notes?: string; }

interface BackendFinancialReport {
  revenue: { rentBilled:number; serviceChargesBilled:number; totalBilled:number; totalCollected:number; providerConfirmed:number; manualAcknowledged:number; legacyUnclassified:number; collectionRate:number; outstanding:number };
  expenses: { total:number; byCategory:Array<{_id:string;amount:number}> };
  profitAndLoss: { accrual:number; cash:number };
  arrears: { amount:number; chargeCount:number };
  serviceCharges: { assessed:number };
  occupancy: { activeTenancies:number };
  payments: { count:number };
}

export function normalizeFinancialReport(report: BackendFinancialReport | FinancialReport): FinancialReport {
  if (!('revenue' in report)) return report;
  return {
    ...report.revenue,
    totalExpenses: report.expenses.total,
    expensesByCategory: Object.fromEntries(report.expenses.byCategory.map(item=>[item._id,item.amount])),
    accrualPnl: report.profitAndLoss.accrual,
    cashPnl: report.profitAndLoss.cash,
    arrearsAmount: report.arrears.amount,
    arrearsCount: report.arrears.chargeCount,
    serviceChargeAssessed: report.serviceCharges.assessed,
    activeTenancyCount: report.occupancy.activeTenancies,
    paymentCount: report.payments.count,
  };
}

function query(path: string, params: Record<string, QueryValue>): string { const qs = toQueryString(params); return qs ? `${path}?${qs}` : path; }

export const financeClient = {
  rent: {
    list: (organizationId: string) => api<RentCharge[]>(`/organizations/${organizationId}/rent`),
    get: (id: string) => api<RentCharge>(`/rent/${id}`),
    create: (organizationId: string, input: RentChargeInput) => api<RentCharge>(`/organizations/${organizationId}/rent`, { method: 'POST', body: JSON.stringify(input) }),
    generate: (organizationId: string, input: GenerateRentInput) => api<RentCharge[]>(`/organizations/${organizationId}/rent/generate`, { method: 'POST', body: JSON.stringify(input) }),
  },
  payments: {
    list: (organizationId: string) => api<Payment[]>(`/organizations/${organizationId}/payments`),
    create: (organizationId: string, input: PaymentInput) => api<Payment>(`/organizations/${organizationId}/payments`, { method: 'POST', body: JSON.stringify(input) }),
    confirm: (id: string, input: AllocationInput) => api<Payment>(`/payments/${id}/confirm`, { method: 'POST', body: JSON.stringify(input) }),
    reverse: (id: string) => api<Payment>(`/payments/${id}/reverse`, { method: 'POST' }),
  },
  paymentClaims: {
    list: (organizationId: string, params: { state?: Payment['verificationState']; page?: number; limit?: number } = {}) => api<{ items: Payment[]; total: number; page: number; limit: number }>(query(`/organizations/${organizationId}/payment-claims`, params)),
    report: (organizationId: string, input: PaymentClaimInput) => api<Payment>(`/organizations/${organizationId}/payment-claims`, { method: 'POST', body: JSON.stringify(input) }),
    review: (id: string, input: { action: 'REJECT' | 'CLARIFY' | 'DISPUTE'; note: string }) => api<Payment>(`/payment-claims/${id}/review`, { method: 'POST', body: JSON.stringify(input) }),
  },
  refunds: {
    list: (organizationId: string) => api<PaymentRefund[]>(`/organizations/${organizationId}/payment-refunds`),
    request: (paymentId: string, reason: string) => api<PaymentRefund>(`/payments/${paymentId}/refund`, { method: 'POST', body: JSON.stringify({ reason }) }),
    reconcile: (paymentId: string) => api<PaymentRefund>(`/payments/${paymentId}/refund/reconcile`, { method: 'POST' }),
    review: (paymentId: string, input: { note: string; providerRefundId?: number }) => api<PaymentRefund>(`/payments/${paymentId}/refund/review`, { method: 'POST', body: JSON.stringify(input) }),
    applyLedger: (paymentId: string) => api<Payment>(`/payments/${paymentId}/refund/apply-ledger`, { method: 'POST' }),
  },
  paymentDestinations: {
    list: (organizationId:string) => api<PaymentDestination[]>(`/organizations/${organizationId}/payment-destinations`),
    create: (organizationId:string,input:PaymentDestinationInput) => api<PaymentDestination>(`/organizations/${organizationId}/payment-destinations`,{method:'POST',body:JSON.stringify(input)}),
    disable: (id:string) => api<PaymentDestination>(`/payment-destinations/${id}/disable`,{method:'POST'}),
    refresh: (id:string) => api<PaymentDestination>(`/payment-destinations/${id}/refresh`,{method:'POST'}),
  },
  paymentInstructions: (tenancyId:string) => api<TenancyPaymentInstructions>(`/tenancies/${tenancyId}/payment-instructions`),
  expenses: {
    list: (organizationId: string) => api<Expense[]>(`/organizations/${organizationId}/expenses`),
    create: (organizationId: string, input: ExpenseInput) => api<Expense>(`/organizations/${organizationId}/expenses`, { method: 'POST', body: JSON.stringify(input) }),
    approve: (id: string, notes?: string) => api<Expense>(`/expenses/${id}/approve`, { method: 'POST', body: JSON.stringify(notes ? { notes } : {}) }),
    pay: (id: string, notes?: string) => api<Expense>(`/expenses/${id}/pay`, { method: 'POST', body: JSON.stringify(notes ? { notes } : {}) }),
    reject: (id: string, notes?: string) => api<Expense>(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify(notes ? { notes } : {}) }),
  },
  serviceCharges: {
    list: (organizationId: string) => api<ServiceChargeAssessment[]>(`/organizations/${organizationId}/service-charges`),
    create: (organizationId: string, input: ServiceChargeInput) => api<ServiceChargeAssessment>(`/organizations/${organizationId}/service-charges`, { method: 'POST', body: JSON.stringify(input) }),
  },
  arrears: {
    list: (organizationId: string) => api<ArrearsCase[]>(`/organizations/${organizationId}/arrears`),
    openForTenant: (organizationId: string, tenantId: string) => api<ArrearsCase>(`/organizations/${organizationId}/arrears/tenants/${tenantId}`, { method: 'POST' }),
    update: (id: string, input: ArrearsUpdateInput) => api<ArrearsCase>(`/arrears/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  },
  report: async (organizationId: string, params: { from: string; to: string; propertyId?: string }) => normalizeFinancialReport(await api<BackendFinancialReport | FinancialReport>(query(`/organizations/${organizationId}/financial-report`, params))),
  periods: {
    list: (organizationId: string) => api<FinancialPeriod[]>(`/organizations/${organizationId}/financial-periods`),
    create: (organizationId: string, input: FinancialPeriodInput) => api<FinancialPeriod>(`/organizations/${organizationId}/financial-periods`, { method: 'POST', body: JSON.stringify(input) }),
    close: (id: string) => api<FinancialPeriod>(`/financial-periods/${id}/close`, { method: 'POST' }),
  },
};
