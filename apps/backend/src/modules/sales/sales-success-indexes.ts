import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../../database/models/SalesAgent.js';
import { Job } from '../../database/models/Job.js';
import { SalesTrackingLink, SalesAttribution } from '../../database/models/SalesCampaign.js';
import { SalesRecipientControl, SalesMessage, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl } from '../../database/models/SalesCommunication.js';
import { Notification } from '../../database/models/Notification.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
export async function assertOutreachIndexes() {
  if (env.NODE_ENV !== 'production') return;
  await assertAgentIndexes();
  for (const [model, name, key] of [
    [SalesRecipientControl, 'sales_recipient_control_unique', { channel: 1, recipientHash: 1 }],
    [SalesMessage, 'sales_message_command_unique', { requestedBy: 1, commandId: 1 }],
    [SalesMessage, 'sales_message_content_unique', { campaignId: 1, recipientHash: 1, contentFingerprint: 1 }],
    [SalesMessage, 'sales_message_provider_unique', { provider: 1, providerMessageId: 1 }],
    [SalesMessage, 'sales_unsubscribe_unique', { unsubscribeHash: 1 }],
    [SalesMessage, 'sales_reply_alias_unique', { replyHash: 1 }],
    [SalesCampaignUsage, 'sales_campaign_usage_unique', { campaignId: 1, bucket: 1 }],
    [SalesConversationEntry, 'sales_conversation_source_unique', { sourceKey: 1 }],
    [SalesProviderControl, 'sales_provider_pace_unique', { key: 1 }],
    [SalesActivity, 'sales_activity_source_unique', { leadId: 1, sourceKey: 1 }],
    [Notification, 'dedupeKey_1', { dedupeKey: 1 }],
    [WebhookEvent, 'provider_1_eventId_1', { provider: 1, eventId: 1 }],
  ] as const) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(i => i.name === name && i.unique && JSON.stringify(i.key) === JSON.stringify(key))) throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install outreach, suppression, notification and webhook deduplication indexes before enabling delivery');
  }
}
export async function assertCampaignIndexes() {
  if (env.NODE_ENV !== 'production') return;
  for (const [model, name, key] of [[SalesTrackingLink, 'sales_link_token_unique', { tokenHash: 1 }], [SalesAttribution, 'sales_conversion_unique', { organizationId: 1, milestone: 1 }]] as const) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(i => i.name === name && i.unique && JSON.stringify(i.key) === JSON.stringify(key))) throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install campaign tracking and conversion indexes before enabling attribution');
  }
}
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
