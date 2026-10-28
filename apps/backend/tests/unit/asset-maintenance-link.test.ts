import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { Unit } from '../../src/database/models/Unit.js';
import { InventoryItem } from '../../src/database/models/InventoryItem.js';
import { MaintenanceRequest } from '../../src/database/models/MaintenanceRequest.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { MaintenanceService } from '../../src/modules/maintenance/maintenance.service.js';
import { InventoryService } from '../../src/modules/inventory/inventory.service.js';
import { createMaintenanceSchema } from '../../src/modules/maintenance/maintenance.schemas.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

const org = new Types.ObjectId();
const property = new Types.ObjectId();
const building = new Types.ObjectId();
const unit = new Types.ObjectId();
const asset = new Types.ObjectId();

function principal(roles = ['PROPERTY_MANAGER'], permissions = ['maintenance.create', 'inventory.view']): AuthenticatedUser {
  return { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [{
    organizationId: org, roleIds: [], roles, permissions,
    scope: { allProperties: false, propertyIds: [property], buildingIds: [], unitIds: [] },
  }] };
}

function createFixture() {
  const auth = principal();
  vi.spyOn(Unit, 'findOne').mockReturnValue({ lean: async () => ({ _id: unit, organizationId: org, propertyId: property, buildingId: building, floorId: new Types.ObjectId() }) } as never);
  const exists = vi.spyOn(InventoryItem, 'exists').mockResolvedValue({ _id: asset } as never);
  vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<void>) => callback(), endSession: vi.fn() } as never);
  vi.spyOn(MaintenanceRequest.prototype, 'save').mockResolvedValue(undefined as never);
  const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
  const input = createMaintenanceSchema.parse({ unitId: String(unit), assetId: String(asset), title: 'Broken pump', description: 'Pump is leaking', category: 'PLUMBING' });
  return { auth, exists, audit, input };
}

describe('asset-linked maintenance foundation', () => {
  it('persists an asset reference only after checking organization, unit and active status', async () => {
    const { auth, exists, audit, input } = createFixture();
    const request = await MaintenanceService.create(auth, String(org), input);
    expect(exists).toHaveBeenCalledWith({ _id: String(asset), organizationId: org, unitId: unit, status: { $in: ['ACTIVE', 'UNDER_REPAIR'] } });
    expect(String(request.assetId)).toBe(String(asset));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'maintenance.reported' }), expect.anything());
  });

  it('rejects a foreign, disposed or mismatched asset before any write', async () => {
    const { auth, exists, audit, input } = createFixture();
    exists.mockResolvedValue(null);
    const save = vi.mocked(MaintenanceRequest.prototype.save);
    await expect(MaintenanceService.create(auth, String(org), input)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(save).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does not look up or invent an asset when the request is unlinked', async () => {
    const { auth, exists, input } = createFixture();
    const request = await MaintenanceService.create(auth, String(org), { ...input, assetId: undefined });
    expect(exists).not.toHaveBeenCalled();
    expect(request.assetId).toBeUndefined();
  });

  it('returns only explicitly linked history and hides other residents reports', async () => {
    const auth = principal(['TENANT'], ['inventory.view', 'maintenance.view']);
    vi.spyOn(InventoryItem, 'findById').mockResolvedValue({ _id: asset, organizationId: org, propertyId: property, buildingId: building, unitId: unit } as never);
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const sort = vi.fn().mockReturnValue({ limit });
    const find = vi.spyOn(MaintenanceRequest, 'find').mockReturnValue({ sort } as never);
    await InventoryService.maintenanceHistory(auth, String(asset));
    expect(find).toHaveBeenCalledWith({ organizationId: org, unitId: unit, assetId: asset, reportedByUserId: auth.userId });
    expect(limit).toHaveBeenCalledWith(100);
  });

  it('denies history outside property scope and list without inventory permission', async () => {
    const auth = principal(['PROPERTY_MANAGER'], ['inventory.view', 'maintenance.view']);
    auth.memberships[0]?.scope.propertyIds.splice(0);
    vi.spyOn(InventoryItem, 'findById').mockResolvedValue({ _id: asset, organizationId: org, propertyId: property, buildingId: building, unitId: unit } as never);
    const find = vi.spyOn(MaintenanceRequest, 'find');
    await expect(InventoryService.maintenanceHistory(auth, String(asset))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(find).not.toHaveBeenCalled();
    await expect(InventoryService.list(principal(['PROPERTY_MANAGER'], []), String(org))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires maintenance permission in addition to inventory permission', async () => {
    const auth = principal(['PROPERTY_MANAGER'], ['inventory.view']);
    vi.spyOn(InventoryItem, 'findById').mockResolvedValue({ _id: asset, organizationId: org, propertyId: property, buildingId: building, unitId: unit } as never);
    const find = vi.spyOn(MaintenanceRequest, 'find');
    await expect(InventoryService.maintenanceHistory(auth, String(asset))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(find).not.toHaveBeenCalled();
  });

  it('does not allow a direct asset update to reassign its unit', async () => {
    const auth = principal(['PROPERTY_MANAGER'], ['inventory.update']);
    const save = vi.fn();
    vi.spyOn(InventoryItem, 'findById').mockResolvedValue({ _id: asset, organizationId: org, propertyId: property, buildingId: building, unitId: unit, save } as never);
    await expect(InventoryService.update(auth, String(asset), { unitId: String(new Types.ObjectId()) })).rejects.toMatchObject({ code: 'ASSET_UNIT_CHANGE_UNSUPPORTED' });
    expect(save).not.toHaveBeenCalled();
  });
});
