import mongoose, { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../core/errors/AppError.js';
import { DomainEvent } from '../../database/models/DomainEvent.js';
import { Job } from '../../database/models/Job.js';
import { PaymentActivity } from '../../database/models/PaymentActivity.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';

const PAYMENT_EVENTS = ['payment.confirmed', 'payment.reversed'] as const;
const paymentPayload = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  buildingId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  unitId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  amountMajorUnits: z.number().finite().nonnegative(),
  currency: z.string().length(3),
}).passthrough();

function deliveryKey(eventId: string) { return `domain-event:payment-activity:${eventId}`; }

export class EventDeliveryService {
  static isSupported(name: string): boolean { return PAYMENT_EVENTS.some((event) => event === name); }

  static async enqueue(event: { eventId: string; organizationId: Types.ObjectId; name: string }, session: ClientSession) {
    if (!this.isSupported(event.name)) return;
    await Job.create([{
      organizationId: event.organizationId,
      type: 'domain-event.payment-activity',
      payload: { eventId: event.eventId },
      status: 'QUEUED',
      priority: 0,
      availableAt: new Date(),
      maxAttempts: 5,
      dedupeKey: deliveryKey(event.eventId),
    }], { session });
  }

  static async consume(eventId: string, organizationId: Types.ObjectId) {
    const event = await DomainEvent.findOne({ eventId, organizationId });
    if (!event || !this.isSupported(event.name) || event.aggregateType !== 'Payment') {
      throw new AppError(404, 'DELIVERY_EVENT_NOT_FOUND', 'Supported event not found in job organization');
    }
    const parsed = paymentPayload.safeParse(event.payload);
    if (!parsed.success) throw new AppError(422, 'DELIVERY_PAYLOAD_INVALID', 'Payment event payload is invalid');
    const payload = parsed.data;
    await PaymentActivity.updateOne({ eventId }, { $setOnInsert: {
      eventId,
      organizationId: event.organizationId,
      paymentId: event.aggregateId,
      propertyId: new Types.ObjectId(payload.propertyId),
      buildingId: new Types.ObjectId(payload.buildingId),
      unitId: new Types.ObjectId(payload.unitId),
      name: event.name,
      amountMajorUnits: payload.amountMajorUnits,
      currency: payload.currency,
      occurredAt: event.occurredAt,
    } }, { upsert: true });
    await DomainEvent.updateOne({ _id: event._id, publishedAt: { $exists: false } }, { $set: { publishedAt: new Date() } });
  }

  static async replay(eventId: string, auth: AuthenticatedUser) {
    if (!auth.isPlatformAdmin) throw new AppError(403, 'FORBIDDEN', 'Platform admin required');
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const event = await DomainEvent.findOne({ eventId }).session(session);
        if (!event || !this.isSupported(event.name) || event.aggregateType !== 'Payment') {
          throw new AppError(404, 'DELIVERY_EVENT_NOT_FOUND', 'Supported event not found');
        }
        const dedupeKey = deliveryKey(eventId);
        const existing = await Job.findOne({ dedupeKey }).session(session);
        if (existing?.status === 'RUNNING') throw new AppError(409, 'DELIVERY_IN_PROGRESS', 'Event delivery is running');
        if (existing) {
          const result = await Job.updateOne({ _id: existing._id, status: { $ne: 'RUNNING' } }, {
            $set: { status: 'QUEUED', availableAt: new Date(), attempts: 0 },
            $unset: { completedAt: 1, failedAt: 1, deadLetteredAt: 1, lastError: 1 },
          }, { session });
          if (result.modifiedCount !== 1) throw new AppError(409, 'DELIVERY_IN_PROGRESS', 'Event delivery state changed');
        } else {
          await this.enqueue(event, session);
        }
        await AuditLog.create([{ organizationId: event.organizationId, actorUserId: auth.userId, action: 'domain-event.replay',
          resourceType: 'DomainEvent', resourceId: event._id, occurredAt: new Date(),
          metadata: { eventId, consumer: 'payment-activity' } }], { session });
        return { eventId, status: 'QUEUED' as const };
      });
    } finally { await session.endSession(); }
  }
}
