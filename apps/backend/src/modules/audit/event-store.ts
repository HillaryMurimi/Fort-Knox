import { randomUUID } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { DomainEvent } from '../../database/models/DomainEvent.js';
import { AppError } from '../../core/errors/AppError.js';

export interface EventInput {
  organizationId: Types.ObjectId;
  name: string;
  aggregateType: string;
  aggregateId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
  requestId?: string;
  source?: 'APPLICATION' | 'PROVIDER' | 'SYSTEM';
  correlationId?: string;
  causationId?: string;
  version?: number;
  schemaVersion?: number;
  payload: unknown;
}

const MAX_PAYLOAD_BYTES = 32 * 1024;
const SECRET_FIELD = /^(password|secret|token|authorization|otp|apiKey|privateKey|credentials|rawPayload)$/i;

function assertSafePayload(payload: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) throw new AppError(400, 'EVENT_PAYLOAD_INVALID', 'Event payload must not contain cycles');
    seen.add(value);
    if (Array.isArray(value)) value.forEach(visit);
    else for (const [key, child] of Object.entries(value)) {
      if (SECRET_FIELD.test(key)) throw new AppError(400, 'EVENT_PAYLOAD_SENSITIVE', 'Event payload contains a sensitive field');
      visit(child);
    }
  };
  visit(payload);
  const serialized = JSON.stringify(payload);
  if (!serialized || Buffer.byteLength(serialized) > MAX_PAYLOAD_BYTES) {
    throw new AppError(400, 'EVENT_PAYLOAD_INVALID', 'Event payload is empty or too large');
  }
}

export class EventStore {
  static async append(input: EventInput, session?: ClientSession) {
    assertSafePayload(input.payload);
    if (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 1)) {
      throw new AppError(400, 'EVENT_VERSION_INVALID', 'Event version must be a positive integer');
    }
    if (input.schemaVersion !== undefined && (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1)) {
      throw new AppError(400, 'EVENT_SCHEMA_VERSION_INVALID', 'Event schema version must be a positive integer');
    }

    const aggregate = { aggregateType: input.aggregateType, aggregateId: input.aggregateId };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const query = DomainEvent.findOne(aggregate).sort({ version: -1 }).select('version');
      if (session) query.session(session);
      const latest = await query.lean();
      const version = (latest?.version ?? 0) + 1;
      if (input.version !== undefined && input.version !== version) {
        throw new AppError(409, 'EVENT_VERSION_CONFLICT', 'Aggregate event version has changed');
      }
      try {
        const event = {
          ...input,
          eventId: randomUUID(),
          version,
          schemaVersion: input.schemaVersion ?? 1,
          occurredAt: new Date(),
        };
        if (session) {
          const [created] = await DomainEvent.create([event], { session });
          return created;
        }
        return await DomainEvent.create(event);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
        if (session) throw new AppError(409, 'EVENT_VERSION_CONFLICT', 'Aggregate event version changed during the transaction');
      }
    }
    throw new AppError(409, 'EVENT_VERSION_CONFLICT', 'Could not reserve the next aggregate event version');
  }
}
