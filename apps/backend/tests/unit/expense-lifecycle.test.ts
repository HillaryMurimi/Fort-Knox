import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { Expense } from '../../src/database/models/Expense.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

function fixture(status: 'DRAFT' | 'SUBMITTED' | 'APPROVED', allowedProperty = true) {
  const organizationId = new Types.ObjectId(), propertyId = new Types.ObjectId(), userId = new Types.ObjectId();
  const auth: AuthenticatedUser = { userId, isPlatformAdmin: false, memberships: [{ organizationId, roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['expense.create','expense.approve','expense.pay'], scope: { allProperties: false, propertyIds: allowedProperty ? [propertyId] : [], buildingIds: [], unitIds: [] } }] };
  const expense = { _id: new Types.ObjectId(), organizationId, propertyId, status, classification: 'OPEX', currency: 'KES', amountMinor: 10000, updatedBy: userId, save: vi.fn().mockResolvedValue(undefined) };
  vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<unknown>) => callback(), endSession: vi.fn() } as never);
  vi.spyOn(Expense, 'findById').mockReturnValue({ session: async () => expense } as never);
  const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
  return { auth, expense, audit };
}

describe('expense lifecycle', () => {
  it('submits a draft and records an audit event', async () => {
    const {auth,expense,audit}=fixture('DRAFT');
    await FinanceService.submitExpense(auth,String(expense._id));
    expect(expense.status).toBe('SUBMITTED');
    expect(expense.save).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({action:'expense.submit',organizationId:expense.organizationId}),expect.anything());
  });

  it('does not approve an unsubmitted expense', async () => {
    const {auth,expense,audit}=fixture('DRAFT');
    await expect(FinanceService.approveExpense(auth,String(expense._id))).rejects.toMatchObject({code:'INVALID_EXPENSE_STATE'});
    expect(expense.save).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
  });

  it('rejects manager approval outside their assigned property', async () => {
    const {auth,expense,audit}=fixture('SUBMITTED',false);
    await expect(FinanceService.approveExpense(auth,String(expense._id))).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(expense.save).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
  });

  it('requires a payment basis before marking an approved expense paid', async () => {
    const {auth,expense,audit}=fixture('APPROVED');
    await expect(FinanceService.payExpense(auth,String(expense._id),{paidAt:new Date(),paymentBasis:''})).rejects.toMatchObject({code:'PAYMENT_BASIS_REQUIRED'});
    expect(expense.save).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
  });
});
