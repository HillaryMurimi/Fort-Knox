import { Types } from 'mongoose';
import { MoveOut } from '../../database/models/MoveOut.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Unit } from '../../database/models/Unit.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { InitiateMoveOutInput, InspectMoveOutInput, ReconcileMoveOutInput } from './move-out.schemas.js';

export class MoveOutService {
  static async list(auth: AuthenticatedUser, organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter.unitId = { $in: ids };
    return MoveOut.find(filter).sort({ createdAt: -1 }).lean();
  }

  private static async loadAuthorized(auth: AuthenticatedUser, moveOutId: string, permission: string) {
    const moveOut = await MoveOut.findById(moveOutId);
    if (!moveOut) throw new AppError(404, 'NOT_FOUND', 'Move-out record not found');
    const tenant = await Tenant.findById(moveOut.tenantId).lean();
    ResourceScopeService.assertUnit(auth, moveOut, permission, tenant?.userId);
    return moveOut;
  }

  static async initiate(auth: AuthenticatedUser, tenancyId: string, data: InitiateMoveOutInput) {
    const tenancy = await Tenancy.findById(tenancyId);
    if (!tenancy) throw new AppError(404, 'NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findById(tenancy.tenantId);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant profile not found');
    ResourceScopeService.assertUnit(auth, tenancy, 'move-out.request', tenant.userId);
    if (!['ACTIVE', 'NOTICE'].includes(tenancy.status)) throw new AppError(409, 'INVALID_TENANCY_STATE', 'Move-out can only start from an active or notice tenancy');
    const existing = await MoveOut.findOne({ tenancyId: tenancy._id, status: { $nin: ['CANCELLED', 'COMPLETED'] } });
    if (existing) throw new AppError(409, 'MOVE_OUT_EXISTS', 'An active move-out already exists for this tenancy');
    tenancy.status = 'NOTICE';
    tenancy.updatedBy = new Types.ObjectId(auth.userId);
    await tenancy.save();
    return MoveOut.create({ organizationId: tenancy.organizationId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenancy.tenantId, tenancyId: tenancy._id, requestedMoveOutDate: data.requestedMoveOutDate, status: 'INITIATED', depositAmount: tenancy.depositAmount, reconciliationNotes: data.notes, createdBy: auth.userId, updatedBy: auth.userId });
  }

  static async inspect(auth: AuthenticatedUser, moveOutId: string, data: InspectMoveOutInput) {
    const moveOut = await this.loadAuthorized(auth, moveOutId, 'move-out.manage');
    if (!['INITIATED', 'INSPECTION_PENDING'].includes(moveOut.status)) throw new AppError(409, 'INVALID_MOVE_OUT_STATE', 'Move-out is not awaiting inspection');
    moveOut.inspection = { condition: data.condition, notes: data.notes, evidenceIds: data.evidenceIds.map((id) => new Types.ObjectId(id)), inspectedAt: new Date(), inspectedBy: new Types.ObjectId(auth.userId) };
    moveOut.status = 'RECONCILIATION_PENDING';
    moveOut.updatedBy = new Types.ObjectId(auth.userId);
    await moveOut.save();
    return moveOut;
  }

  static async reconcile(auth: AuthenticatedUser, moveOutId: string, data: ReconcileMoveOutInput) {
    const moveOut = await this.loadAuthorized(auth, moveOutId, 'move-out.manage');
    if (moveOut.status !== 'RECONCILIATION_PENDING') throw new AppError(409, 'INVALID_MOVE_OUT_STATE', 'Move-out is not awaiting reconciliation');
    const totalDeductions = data.deductions.reduce((sum, item) => sum + item.amount, 0);
    const depositRefund = Math.max(moveOut.depositAmount - totalDeductions, 0);
    moveOut.actualMoveOutDate = data.actualMoveOutDate;
    moveOut.set('meterReadings', data.meterReadings);
    moveOut.set('deductions', data.deductions.map((item) => ({ ...item, evidenceIds: item.evidenceIds.map((id) => new Types.ObjectId(id)) })));
    moveOut.totalDeductions = totalDeductions;
    moveOut.depositRefund = depositRefund;
    moveOut.outstandingBalance = data.outstandingBalance;
    moveOut.reconciliationNotes = data.reconciliationNotes;
    moveOut.status = 'RECONCILIATION_PENDING';
    moveOut.updatedBy = new Types.ObjectId(auth.userId);
    await moveOut.save();
    return moveOut;
  }

  static async complete(auth: AuthenticatedUser, moveOutId: string) {
    const moveOut = await this.loadAuthorized(auth, moveOutId, 'move-out.manage');
    if (moveOut.status !== 'RECONCILIATION_PENDING') throw new AppError(409, 'INVALID_MOVE_OUT_STATE', 'Complete inspection and reconciliation before closing move-out');
    const tenancy = await Tenancy.findById(moveOut.tenancyId);
    const unit = await Unit.findById(moveOut.unitId);
    const tenant = await Tenant.findById(moveOut.tenantId);
    if (!tenancy || !unit || !tenant) throw new AppError(409, 'LIFECYCLE_DATA_MISSING', 'Required tenancy, unit, or tenant record is missing');
    ResourceScopeService.assertUnit(auth, tenancy, 'move-out.manage', tenant.userId);
    const now = new Date();
    tenancy.status = 'MOVED_OUT'; tenancy.movedOutAt = moveOut.actualMoveOutDate ?? now; tenancy.updatedBy = new Types.ObjectId(auth.userId);
    unit.status = 'VACANT'; unit.updatedBy = new Types.ObjectId(auth.userId);
    tenant.status = 'INACTIVE'; tenant.updatedBy = new Types.ObjectId(auth.userId);
    moveOut.status = 'COMPLETED'; moveOut.completedAt = now; moveOut.completedBy = new Types.ObjectId(auth.userId); moveOut.updatedBy = new Types.ObjectId(auth.userId);
    await Promise.all([tenancy.save(), unit.save(), tenant.save(), moveOut.save()]);
    return moveOut;
  }

  static async get(auth: AuthenticatedUser, moveOutId: string) { return this.loadAuthorized(auth, moveOutId, 'move-out.view'); }
}
