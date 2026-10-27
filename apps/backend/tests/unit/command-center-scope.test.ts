import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Property } from '../../src/database/models/Property.js';
import { IntelligenceAlert } from '../../src/database/models/IntelligenceAlert.js';
import { CommandCenterService } from '../../src/modules/command-center/command-center.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

function authFor(organizationId: Types.ObjectId, propertyIds: Types.ObjectId[], buildingIds: Types.ObjectId[] = []): AuthenticatedUser {
  return { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [{ organizationId, roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['command-center.view', 'intelligence.evaluate', 'intelligence.history.view'],
    scope: { allProperties: false, propertyIds, buildingIds, unitIds: [] } }] };
}

describe('property-wide command center scope', () => {
  it('denies building-only access rather than aggregating the entire property', async () => {
    const org = new Types.ObjectId();
    const find = vi.spyOn(Property, 'find');
    await expect(CommandCenterService.dashboard(authFor(org, [], [new Types.ObjectId()]), String(org), {}))
      .rejects.toMatchObject({ code: 'PROPERTY_SCOPE_REQUIRED' });
    expect(find).not.toHaveBeenCalled();
  });

  it('denies a different organization before any property read', async () => {
    const find = vi.spyOn(Property, 'find');
    await expect(CommandCenterService.dashboard(authFor(new Types.ObjectId(), [new Types.ObjectId()]), String(new Types.ObjectId()), {}))
      .rejects.toMatchObject({ code: 'ORGANIZATION_ACCESS_DENIED' });
    expect(find).not.toHaveBeenCalled();
  });

  it('filters to explicit full-property assignments and rejects another property', async () => {
    const org = new Types.ObjectId(), allowed = new Types.ObjectId(), other = new Types.ObjectId();
    const find = vi.spyOn(Property, 'find').mockReturnValue({ sort: () => ({ lean: async () => [] }) } as never);
    const alerts = vi.spyOn(IntelligenceAlert, 'find').mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) } as never);
    const auth = authFor(org, [allowed], [new Types.ObjectId()]);
    await CommandCenterService.dashboard(auth, String(org), {});
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ organizationId: org, _id: { $in: [allowed] } }));
    expect(alerts).toHaveBeenCalledWith(expect.objectContaining({ organizationId: org, propertyId: { $in: [] } }));
    await expect(CommandCenterService.dashboard(auth, String(org), { propertyId: String(other) }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks descendant-only health history and evaluation before property reads', async () => {
    const org = new Types.ObjectId(), property = new Types.ObjectId();
    const auth = authFor(org, [], [new Types.ObjectId()]);
    const findOne = vi.spyOn(Property, 'findOne');
    await expect(CommandCenterService.healthHistory(auth, String(org), String(property)))
      .rejects.toMatchObject({ code: 'PROPERTY_SCOPE_REQUIRED' });
    await expect(CommandCenterService.evaluate(auth, String(org), { propertyId: String(property) }))
      .rejects.toMatchObject({ code: 'PROPERTY_SCOPE_REQUIRED' });
    expect(findOne).not.toHaveBeenCalled();
  });
});
