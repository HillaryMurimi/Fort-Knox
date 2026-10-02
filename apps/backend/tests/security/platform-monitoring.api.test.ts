import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { PlatformMonitorAlert } from '../../src/database/models/PlatformMonitoring.js';
afterEach(() => vi.restoreAllMocks());
function identity(role: string, admin = false) {
  const userId = new Types.ObjectId(), roleId = new Types.ObjectId(), organizationId = new Types.ObjectId();
  vi.spyOn(User, 'findById').mockReturnValue({ lean: async () => ({ _id: userId, status: 'ACTIVE', isPlatformAdmin: admin }) } as never);
  vi.spyOn(OrganizationMembership, 'find').mockReturnValue({ lean: async () => [{ organizationId, roleIds: [roleId], scope: { allProperties: true } }] } as never);
  vi.spyOn(Role, 'find').mockReturnValue({ lean: async () => [{ _id: roleId, key: role, permissions: ['platform.manage'] }] } as never);
  return jwt.sign({ sub: String(userId), type: 'access' }, env.JWT_ACCESS_SECRET);
}
const id = new Types.ObjectId().toString();
const routes = [['GET', ''], ['GET', '/alerts'], ['GET', '/alerts/' + id + '/history'], ['PATCH', '/alerts/' + id], ['GET', '/maintenance-windows'], ['POST', '/maintenance-windows'], ['POST', '/maintenance-windows/' + id + '/end']] as const;
describe('platform monitoring HTTP boundaries', () => {
  it.each(routes)('requires authentication: %s %s', async (method, suffix) => {
    const client = request(createApp()), path = '/api/v1/platform-control/monitoring' + suffix;
    const response = method === 'GET' ? await client.get(path) : method === 'PATCH' ? await client.patch(path).send({}) : await client.post(path).send({});
    expect(response.status).toBe(401);
  });
  it.each(['LANDLORD', 'PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT', 'SUPER_ADMIN'])('denies organization role %s for every monitoring operation', async role => {
    const token = identity(role), app = createApp();
    const find = vi.spyOn(PlatformMonitorAlert, 'find'), start = vi.spyOn(mongoose, 'startSession');
    for (const [method, suffix] of routes) {
      const client = request(app), path = '/api/v1/platform-control/monitoring' + suffix;
      const call = method === 'GET' ? client.get(path) : method === 'PATCH' ? client.patch(path).send({}) : client.post(path).send({});
      const response = await call.auth(token, { type: 'bearer' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PLATFORM_ADMIN_REQUIRED');
    }
    expect(find).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it('returns explicit unavailable data for an authorized admin when the database is disconnected', async () => {
    const token = identity('SUPER_ADMIN', true);
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    const response = await request(createApp()).get('/api/v1/platform-control/monitoring').auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data.areas.find((item: { key: string }) => item.key === 'queues')).toMatchObject({ status: 'NOT_CONFIGURED', sourceAvailable: false });
    expect(response.body.data.areas.find((item: { key: string }) => item.key === 'system').status).toBe('BLOCKED');
    expect(response.body.data.switches).toBeNull();
    expect(JSON.stringify(response.body.data)).not.toMatch(/codeHash|passwordHash|otpHash|recipientUserId|TWILIO_AUTH_TOKEN/);
  });
  it('rejects secret fields in privileged mutations before starting a transaction', async () => {
    const token = identity('SUPER_ADMIN', true), start = vi.spyOn(mongoose, 'startSession');
    const response = await request(createApp()).patch('/api/v1/platform-control/monitoring/alerts/' + id).auth(token, { type: 'bearer' }).send({ expectedRevision: 0, owner: 'Ops', action: 'ACKNOWLEDGE', note: 'Reviewing failure', apiKey: 'fake-value' });
    expect(response.status).toBe(400); expect(start).not.toHaveBeenCalled();
  });
});
