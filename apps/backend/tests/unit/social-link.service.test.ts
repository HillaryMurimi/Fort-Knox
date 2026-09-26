import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { SocialAuthFlow } from '../../src/database/models/SocialAuthFlow.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { Organization } from '../../src/database/models/Organization.js';
import { SocialIdentity } from '../../src/database/models/SocialIdentity.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { challengeSocial, finishSocial } from '../../src/modules/auth/social.service.js';

vi.mock('../../src/modules/auth/auth.service.js', () => ({ issueSession: vi.fn().mockResolvedValue({ refreshToken: 'test-refresh' }) }));

const cookie = 'a'.repeat(43);
const ownerId = new Types.ObjectId();
const organizationId = new Types.ObjectId();

function setup() {
  vi.spyOn(SocialAuthFlow, 'findOne').mockResolvedValue({ _id: new Types.ObjectId(), provider: 'google', status: 'VERIFIED' } as never);
  vi.spyOn(User, 'findOne').mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: ownerId, phone: '+254700000009', passwordHash: 'stored-hash' }) } as never);
  vi.spyOn(Role, 'findOne').mockResolvedValue({ _id: new Types.ObjectId() } as never);
  vi.spyOn(OrganizationMembership, 'findOne').mockResolvedValue({ organizationId } as never);
  vi.spyOn(Organization, 'exists').mockResolvedValue({ _id: organizationId } as never);
  vi.spyOn(SocialAuthFlow, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
  vi.spyOn(bcrypt, 'hash').mockResolvedValue('otp-hash' as never);
}

afterEach(() => vi.restoreAllMocks());

describe('linking an existing owner to social identity', () => {
  it('requires password and sends the code to the account phone', async () => {
    setup();
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    const result = await challengeSocial(cookie, { existingAccount: true, email: 'owner@example.com', password: 'correct-password' });
    expect(result.phoneSuffix).toBe('0009');
    expect(SocialAuthFlow.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ userId: ownerId, phone: '+254700000009', status: 'CHALLENGED' }) }));
  });

  it('rejects a wrong password without starting a phone challenge', async () => {
    setup();
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    await expect(challengeSocial(cookie, { existingAccount: true, email: 'owner@example.com', password: 'wrong-password' })).rejects.toMatchObject({ statusCode: 401, code: 'LINK_CREDENTIALS_INVALID' });
    expect(SocialAuthFlow.updateOne).not.toHaveBeenCalled();
  });

  it('rejects owners without an active landlord membership', async () => {
    setup();
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    vi.mocked(OrganizationMembership.findOne).mockResolvedValue(null as never);
    await expect(challengeSocial(cookie, { existingAccount: true, email: 'owner@example.com', password: 'correct-password' })).rejects.toMatchObject({ statusCode: 403, code: 'SOCIAL_OWNER_REQUIRED' });
    expect(SocialAuthFlow.updateOne).not.toHaveBeenCalled();
  });

  it('creates the provider identity and audit only after a valid phone code', async () => {
    const flowId = new Types.ObjectId();
    vi.spyOn(SocialAuthFlow, 'findOneAndUpdate').mockResolvedValue({ _id: flowId, userId: ownerId, phone: '+254700000009', provider: 'google', subject: 'google-subject', codeHash: 'otp-hash' } as never);
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    vi.spyOn(mongoose.connection, 'transaction').mockImplementation(async (callback) => callback({} as never));
    vi.spyOn(SocialAuthFlow, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
    vi.spyOn(User, 'findOne').mockReturnValue({ session: vi.fn().mockResolvedValue({ _id: ownerId }) } as never);
    vi.spyOn(Role, 'findOne').mockReturnValue({ session: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }) } as never);
    vi.spyOn(OrganizationMembership, 'findOne').mockReturnValue({ session: vi.fn().mockResolvedValue({ organizationId }) } as never);
    vi.spyOn(Organization, 'exists').mockReturnValue({ session: vi.fn().mockResolvedValue({ _id: organizationId }) } as never);
    vi.spyOn(SocialIdentity, 'findOne').mockReturnValue({ session: vi.fn().mockResolvedValue(null) } as never);
    vi.spyOn(SocialIdentity, 'create').mockResolvedValue([] as never);
    vi.spyOn(AuditLog, 'create').mockResolvedValue([] as never);
    vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);

    const result = await finishSocial(cookie, '123456', {});
    expect(result.newOwner).toBe(false);
    expect(SocialIdentity.create).toHaveBeenCalledWith([expect.objectContaining({ provider: 'google', subject: 'google-subject', userId: ownerId })], expect.anything());
    expect(AuditLog.create).toHaveBeenCalledWith([expect.objectContaining({ action: 'auth.social.link', organizationId })], expect.anything());
  });

  it('never creates a link when the phone code is invalid', async () => {
    vi.spyOn(SocialAuthFlow, 'findOneAndUpdate').mockResolvedValue({ codeHash: 'otp-hash' } as never);
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    const create = vi.spyOn(SocialIdentity, 'create');
    await expect(finishSocial(cookie, '000000', {})).rejects.toMatchObject({ code: 'SOCIAL_CODE_INVALID' });
    expect(create).not.toHaveBeenCalled();
  });
});
