import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOne, create } = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));
vi.mock('../../database/models/DomainEvent.js', () => ({ DomainEvent: { findOne, create } }));

import { EventStore } from './event-store.js';

const input = {
  organizationId: new Types.ObjectId(),
  aggregateId: new Types.ObjectId(),
  aggregateType: 'Property',
  name: 'property.updated',
  payload: { status: 'ACTIVE' },
};

describe('EventStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOne.mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => null }) }) });
    create.mockImplementation(async (event) => event);
  });

  it('appends the first event with trace and schema metadata', async () => {
    const event = await EventStore.append({ ...input, correlationId: 'request-1', requestId: 'request-1', actorRole: 'LANDLORD' });
    expect(event).toMatchObject({ version: 1, schemaVersion: 1, correlationId: 'request-1', actorRole: 'LANDLORD' });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('retries a concurrent aggregate-version collision', async () => {
    let read = 0;
    findOne.mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => ({ version: ++read }) }) }) });
    create.mockRejectedValueOnce({ code: 11000 }).mockImplementationOnce(async (event) => event);
    const event = await EventStore.append(input);
    expect(event.version).toBe(3);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rejects stale versions and sensitive payload fields', async () => {
    await expect(EventStore.append({ ...input, version: 2 })).rejects.toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });
    await expect(EventStore.append({ ...input, payload: { nested: { apiKey: 'secret' } } })).rejects.toMatchObject({ code: 'EVENT_PAYLOAD_SENSITIVE' });
    expect(create).not.toHaveBeenCalled();
  });
});
