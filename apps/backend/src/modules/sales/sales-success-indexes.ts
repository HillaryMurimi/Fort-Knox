import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../../database/models/SalesAgent.js';
import { Job } from '../../database/models/Job.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { SalesIdentityMatch, SalesProjectionCheckpoint } from '../../database/models/SalesIdentity.js';
export async function assertLifecycleIndexes() {
  if (env.NODE_ENV !== 'production') return;
  await assertCustomerIdentityIndex();
  for (const [model, name] of [[SalesActivity, 'sales_activity_source_unique'], [SalesIdentityMatch, 'sales_identity_match_unique'], [SalesProjectionCheckpoint, 'organizationId_1'], [Job, 'dedupeKey_1']] as const) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(i => i.name === name && i.unique)) throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install lifecycle and identity indexes before enabling projection');
  }
}
export async function assertAgentIndexes() {
  if (env.NODE_ENV !== 'production') return;
  for (const [model, name, key] of [
    [SalesAgent, 'key_1', { key: 1 }],
    [SalesAgentRun, 'sales_agent_command_unique', { requestedBy: 1, commandId: 1 }],
    [SalesAgentApproval, 'sales_agent_approval_generation_unique', { runId: 1, generation: 1 }],
    [Job, 'dedupeKey_1', { dedupeKey: 1 }],
  ] as const) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(i => i.name === name && i.unique && JSON.stringify(i.key) === JSON.stringify(key)))
      throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Initialize sales and worker idempotency indexes before enabling agents');
  }
}
export async function assertCustomerIdentityIndex() {
  if (env.NODE_ENV !== "production") return;
  const indexes = await SalesLead.collection.indexes().catch(() => []);
  if (
    !indexes.some(
      (i) =>
        i.name === "sales_customer_org_unique" &&
        i.unique &&
        i.key.organizationId === 1 &&
        i.partialFilterExpression?.organizationId?.$type === "objectId",
    )
  )
    throw new AppError(
      503,
      "SALES_INDEXES_REQUIRED",
      "Initialize sales indexes before linking customer identities",
    );
}
