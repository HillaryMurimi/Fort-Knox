import { Types } from "mongoose";
import { redactSalesMeeting } from './sales-calendar.policy.js';
import { z } from "zod";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { SalesActivity } from "../../database/models/SalesActivity.js";
import { SalesMeeting } from "../../database/models/SalesMeeting.js";
import { SuccessRepository } from "./sales-success.repository.js";
import { objectId } from "./sales-success.schemas.js";
import { AppError } from "../../core/errors/AppError.js";
const cursorSchema = z.object({ at: z.iso.datetime(), id: objectId }).strict();
export const historySchema = z
  .object({
    kind: z.enum(["ACTIVITIES", "MEETINGS"]),
    cursor: z.string().max(240).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const historyCursor = (at: Date, id: Types.ObjectId) =>
  Buffer.from(
    JSON.stringify({ at: at.toISOString(), id: String(id) }),
  ).toString("base64url");
export class SalesHistoryService {
  static async page(auth: AuthenticatedUser, id: string, raw: unknown) {
    const input = historySchema.parse(raw);
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (input.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new AppError(
          400,
          "INVALID_HISTORY_CURSOR",
          "History cursor is invalid",
        );
      }
    }
    const lead = await SuccessRepository.load(
      auth,
      id,
      input.kind === "ACTIVITIES" ? "sales.notes.read" : "sales.meetings.read",
    );
    const allowed = (p: string) =>
      auth.isPlatformAdmin ||
      auth.memberships.some(
        (m) => m.scope.allProperties && m.permissions.includes(p),
      );
    const dateField = input.kind === "ACTIVITIES" ? "createdAt" : "startsAt";
    const filter = {
      leadId: { $in: [lead._id, ...lead.mergedLeadIds] },
      ...(cursor
        ? {
            $or: [
              { [dateField]: { $lt: new Date(cursor.at) } },
              {
                [dateField]: new Date(cursor.at),
                _id: { $lt: new Types.ObjectId(cursor.id) },
              },
            ],
          }
        : {}),
    };
    if (input.kind === "ACTIVITIES") {
      const records = await SalesActivity.find({
        ...filter,
        ...(allowed("sales.onboarding.read")
          ? {}
          : { sourceType: { $exists: false } }),
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(input.limit + 1)
        .lean();
      const items = records.slice(0, input.limit),
        last = items.at(-1);
      return {
        items,
        nextCursor:
          records.length > input.limit && last
            ? historyCursor(last.createdAt, last._id)
            : null,
        kind: input.kind,
      };
    }
    const records = await SalesMeeting.find(filter)
      .select(
        allowed("sales.notes.read") ? "-__v" : "-__v -description -outcome -calendar.evidence",
      )
      .sort({ startsAt: -1, _id: -1 })
      .limit(input.limit + 1)
      .lean();
    const items = records.slice(0, input.limit),
      last = items.at(-1);
    return {
      items: items.map(meeting => redactSalesMeeting(meeting)),
      nextCursor:
        records.length > input.limit && last
          ? historyCursor(last.startsAt, last._id)
          : null,
      kind: input.kind,
    };
  }
}
