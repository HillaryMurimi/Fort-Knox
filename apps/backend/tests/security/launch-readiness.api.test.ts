import { mockAdminAssurance } from '../helpers/admin-assurance.js';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { LaunchReadiness } from '../../src/database/models/LaunchReadiness.js';

afterEach(() => vi.restoreAllMocks());
function identity(role: string, platformAdmin = false) {
  const userId = new Types.ObjectId(), roleId = new Types.ObjectId(), organizationId = new Types.ObjectId();
  vi.spyOn(User, 'findById').mockReturnValue({ lean: async () => ({ _id: userId, status: 'ACTIVE', isPlatformAdmin: platformAdmin }) } as never);
  vi.spyOn(OrganizationMembership, 'find').mockReturnValue({ lean: async () => [{ organizationId, roleIds: [roleId], scope: { allProperties: true } }] } as never);
  vi.spyOn(Role, 'find').mockReturnValue({ lean: async () => [{ _id: roleId, key: role, permissions: ['platform.manage'] }] } as never);
  return platformAdmin ? mockAdminAssurance(userId) : jwt.sign({ sub: String(userId), type: 'access' }, env.JWT_ACCESS_SECRET);
}
describe('launch readiness API security', () => {
  it.each(['GET', 'PATCH'])('requires authentication for %s', async method => {
    const app = request(createApp());
    const response = method === 'GET' ? await app.get('/api/v1/platform-control/launch-readiness') : await app.patch('/api/v1/platform-control/launch-readiness/MPESA').send({});
    expect(response.status).toBe(401);
  });
  it.each(['LANDLORD', 'PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT', 'SUPER_ADMIN'])('denies organization role %s without platform administration', async role => {
    const token = identity(role);
    const find = vi.spyOn(LaunchReadiness, 'find');
    const app = createApp();
    for (const method of ['GET', 'PATCH']) {
      const client = request(app);
      const response = method === 'GET' ? await client.get('/api/v1/platform-control/launch-readiness').auth(token, { type: 'bearer' }) : await client.patch('/api/v1/platform-control/launch-readiness/MPESA').auth(token, { type: 'bearer' }).send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PLATFORM_ADMIN_REQUIRED');
    }
    expect(find).not.toHaveBeenCalled();
  });
  it('allows platform administration to retrieve the safe catalog', async () => {
    const token = identity('SUPER_ADMIN', true);
    vi.spyOn(LaunchReadiness, 'find').mockReturnValue({ lean: async () => [] } as never);
    const response = await request(createApp()).get('/api/v1/platform-control/launch-readiness').auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(12);
    expect(response.body.data.summary.ready).toBe(0);
  });
});
