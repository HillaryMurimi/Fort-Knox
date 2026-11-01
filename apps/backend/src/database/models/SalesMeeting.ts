import { Schema, model } from "mongoose";

const schema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    representativeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    type: {
      type: String,
      enum: ["DEMO", "CALL", "ONBOARDING", "REVIEW"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "SCHEDULED",
        "COMPLETED",
        "CANCELLED",
        "RESCHEDULED",
        "NO_SHOW",
        "NOT_HELD",
      ],
      default: "SCHEDULED",
    },
    description: { type: String, maxlength: 20000, default: "" },
    outcome: { type: String, maxlength: 5000 },
    revision: { type: Number, default: 0 },
    timezone: { type: String, default: 'Africa/Nairobi' },
    calendar: { type: new Schema({
      provider: { type: String, enum: ['GOOGLE', 'MICROSOFT'], required: true },
      fingerprint: { type: String, required: true },
      status: { type: String, enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED', 'UNCERTAIN', 'CONFLICT'], required: true },
      eventId: String, etag: String, creationKey: { type: String, required: true },
      operation: { type: String, enum: ['CREATE', 'RESCHEDULE', 'CANCEL', 'SYNC'], required: true },
      commandId: { type: String, required: true }, commandHash: { type: String, required: true },
      originApprovalId: { type: Schema.Types.ObjectId, ref: 'SalesAgentApproval' },
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, requestedAt: { type: Date, required: true },
      attendeeHash: String, attendee: { type: String, select: false }, evidence: { type: String, maxlength: 2000 },
      targetStart: { type: Date, required: true }, targetEnd: { type: Date, required: true },
      attempt: { type: Number, default: 0 }, leaseOwner: String, leaseUntil: Date,
      attemptedAt: Date, eventRecordedAt: Date, syncedAt: Date, confirmedAt: Date, invitationRequested: Boolean, errorCode: String,
      contentExpiresAt: Date, contentRedactedAt: Date,
    }, { _id: false }), default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
schema.index({ leadId: 1, startsAt: -1 });
schema.index({ representativeId: 1, status: 1, startsAt: 1, endsAt: 1 });
schema.index({ 'calendar.creationKey': 1 }, { unique: true, name: 'sales_calendar_creation_unique', partialFilterExpression: { 'calendar.creationKey': { $type: 'string' } } });
schema.index({ 'calendar.status': 1, _id: 1 }, { name: 'sales_calendar_sync_scan' });
export const SalesMeeting = model("SalesMeeting", schema);
