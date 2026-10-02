import type { Types, ClientSession } from "mongoose";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../../database/models/SalesDemoSession.js";
import { AppError } from "../../core/errors/AppError.js";
export const SalesDemoRepository = {
  async load(
    id: string,
    actor: Types.ObjectId,
    admin: boolean,
    session?: ClientSession,
  ) {
    const record = await SalesDemoSession.findOne({
      _id: id,
      dataset: "SALES_DEMO",
      ...(admin ? {} : { createdBy: actor }),
    }).session(session ?? null);
    if (!record)
      throw new AppError(
        404,
        "DEMO_NOT_FOUND",
        "Demo session not found or not accessible",
      );
    return record;
  },
  events(id: Types.ObjectId) {
    return SalesValueEvent.find({ sessionId: id })
      .sort({ at: -1 })
      .limit(100)
      .select("kind resourceId at generation")
      .lean();
  },
  list(actor: Types.ObjectId, admin: boolean, page: number) {
    const filter = {
      dataset: "SALES_DEMO" as const,
      ...(admin ? {} : { createdBy: actor }),
    };
    return Promise.all([
      SalesDemoSession.find(filter)
        .select(
          "leadId profile revision generation pilotOrganizationId createdAt",
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      SalesDemoSession.countDocuments(filter),
    ]);
  },
};
