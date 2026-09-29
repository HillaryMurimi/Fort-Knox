import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOne, create, createJob } = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), createJob: vi.fn() }));
vi.mock('../../database/models/DomainEvent.js', () => ({ DomainEvent: { findOne, create } }));
vi.mock('../../database/models/Job.js', () => ({ Job: { create: createJob } }));

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

  it('passes a transaction session to both sequence read and append', async () => {
    const session = { id: 'transaction' } as unknown as Parameters<typeof EventStore.append>[1];
    const sessionQuery = vi.fn();
    findOne.mockReturnValue({ sort: () => ({ select: () => ({ session: sessionQuery, lean: async () => null }) }) });
    create.mockResolvedValueOnce([{ eventId: 'in-transaction', version: 1 }]);
    const event = await EventStore.append(input, session);
    expect(sessionQuery).toHaveBeenCalledWith(session);
    expect(create).toHaveBeenCalledWith([expect.objectContaining({ name: 'property.updated', version: 1 })], { session });
    expect(event).toMatchObject({ eventId: 'in-transaction', version: 1 });
  });

  it('requires a session for payment events and enqueues the delivery job in it', async () => {
    await expect(EventStore.append({ ...input, name: 'payment.confirmed' })).rejects.toMatchObject({ code: 'EVENT_TRANSACTION_REQUIRED' });
    const session = { id: 'transaction' } as unknown as Parameters<typeof EventStore.append>[1];
    findOne.mockReturnValue({ sort: () => ({ select: () => ({ session: vi.fn(), lean: async () => null }) }) });
    create.mockResolvedValueOnce([{ ...input, name: 'payment.confirmed', eventId: 'payment-event', version: 1 }]);
    await EventStore.append({ ...input, name: 'payment.confirmed' }, session);
    expect(createJob).toHaveBeenCalledWith([expect.objectContaining({
      type: 'domain-event.payment-activity', payload: { eventId: 'payment-event' }, dedupeKey: 'domain-event:payment-activity:payment-event',
    })], { session });
  });

  it('does not expose a payment event when its outbox insert fails', async () => {
    const session = { id: 'transaction' } as unknown as Parameters<typeof EventStore.append>[1];
    findOne.mockReturnValue({ sort: () => ({ select: () => ({ session: vi.fn(), lean: async () => null }) }) });
    create.mockResolvedValueOnce([{ ...input, name: 'payment.confirmed', eventId: 'payment-event', version: 1 }]);
    createJob.mockRejectedValueOnce(new Error('job insert failed'));
    await expect(EventStore.append({ ...input, name: 'payment.confirmed' }, session)).rejects.toThrow('job insert failed');
  });
});
