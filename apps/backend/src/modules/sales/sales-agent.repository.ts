import mongoose, {
  type ClientSession,
  type Types,
  type PipelineStage,
} from "mongoose";
import {
  SalesAgent,
  SalesAgentRun,
  SalesAgentApproval,
} from "../../database/models/SalesAgent.js";
import { Job } from "../../database/models/Job.js";
import { User } from "../../database/models/User.js";
import { AppError } from "../../core/errors/AppError.js";
import { buildAuthContext } from "../access-control/access-control.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { assertSuccessPermission } from "./sales-success.repository.js";
import type { AgentKey } from "./sales-agent.schemas.js";
export async function salesTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
export const SalesAgentRepository = {
  async principal(id: Types.ObjectId): Promise<AuthenticatedUser> {
    const user = await User.findOne({ _id: id, status: "ACTIVE" })
      .select("isPlatformAdmin")
      .lean();
    if (!user)
      throw new AppError(
        403,
        "AGENT_ACTOR_REVOKED",
        "Task owner is no longer active",
      );
    return buildAuthContext(id, user.isPlatformAdmin);
  },
  scopePipeline(auth: AuthenticatedUser, permission: string): PipelineStage[] {
    assertSuccessPermission(auth, permission);
    if (auth.isPlatformAdmin) return [];
    return [
      {
        $lookup: {
          from: "salesleads",
          let: { lead: "$leadId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$lead"] },
                    { $eq: ["$assignedTo", auth.userId] },
                  ],
                },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "authorizedLead",
        },
      },
      { $match: { "authorizedLead.0": { $exists: true } } },
      { $unset: "authorizedLead" },
    ];
  },
  async enqueue(
    runId: Types.ObjectId,
    actor: Types.ObjectId,
    suffix: string,
    session: ClientSession,
  ) {
    await Job.updateOne(
      { dedupeKey: `sales-agent:${runId}:${suffix}` },
      {
        $setOnInsert: {
          type: "sales.agent.execute",
          payload: { runId: String(runId) },
          createdBy: actor,
          status: "QUEUED",
          availableAt: new Date(),
          maxAttempts: 3,
        },
      },
      { upsert: true, session },
    );
  },
  config(key: AgentKey) {
    return SalesAgent.findOne({ key });
  },
  run(id: string) {
    return SalesAgentRun.findById(id);
  },
  approvals: SalesAgentApproval,
};
