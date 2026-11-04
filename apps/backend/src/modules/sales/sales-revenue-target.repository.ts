import type { ClientSession, Types } from "mongoose";
import { SalesRevenueTarget } from "../../database/models/SalesRevenueTarget.js";
import { SalesCampaign } from "../../database/models/SalesCampaign.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import type { RevenueTargetPolicy } from "./sales-revenue.schemas.js";
// These are platform-owned planning records, never landlord organization data.
// Every service entry point establishes SUPER_ADMIN authority before using this repository.
export const RevenueTargetRepository = {
  indexes: () => SalesRevenueTarget.collection.indexes(),
  campaignExists: (id: string) => SalesCampaign.exists({ _id: id }),
  async list(page: number) {
    const [items, total] = await Promise.all([
      SalesRevenueTarget.find()
        .select("-commandHash -commandId")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      SalesRevenueTarget.countDocuments(),
    ]);
    return { items, total, page };
  },
  view: (id: string) =>
    SalesRevenueTarget.findById(id).select("-commandHash -commandId").lean(),
  command: (requestedBy: Types.ObjectId, commandId: string) =>
    SalesRevenueTarget.findOne({ requestedBy, commandId }),
  create: (
    input: {
      requestedBy: Types.ObjectId;
      commandId: string;
      commandHash: string;
      policy: RevenueTargetPolicy;
    },
    session: ClientSession,
  ) => SalesRevenueTarget.create([input], { session }),
  async replace(
    id: string,
    revision: number,
    policy: RevenueTargetPolicy,
    session: ClientSession,
  ) {
    return SalesRevenueTarget.findOneAndUpdate(
      { _id: id, revision },
      { $set: { policy }, $inc: { revision: 1 } },
      { session, returnDocument: "before", runValidators: true },
    );
  },
  history: (id: Types.ObjectId) =>
    AuditLog.find({
      resourceType: "SalesRevenueTarget",
      resourceId: id,
      action: {
        $in: ["sales.revenue.target.created", "sales.revenue.target.updated"],
      },
    })
      .select("action actorUserId metadata createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean(),
};
