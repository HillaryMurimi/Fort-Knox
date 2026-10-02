import { Document } from '../../database/models/Document.js';
import { env } from '../../config/env.js';
import { ContractTemplate } from '../../database/models/ContractTemplate.js';
import { OrganizationContract } from '../../database/models/OrganizationContract.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { AppError } from '../../core/errors/AppError.js';
export async function assertContractIndexes() {
  if (env.NODE_ENV !== 'production') return;
  const required = [
    [ContractTemplate, { templateId: 1, version: 1 }], [ContractTemplate, { plans: 1 }], [OrganizationContract, { organizationId: 1, generation: 1 }],
    [SubscriptionInvoice, { contractId: 1 }], [OrganizationSubscription, { organizationId: 1 }],
    [OrganizationSubscription,{provider:1,providerCheckoutReference:1}], [OrganizationSubscription,{provider:1,providerPlanCode:1}], [OrganizationSubscription,{provider:1,providerSubscriptionId:1}], [SubscriptionInvoice,{provider:1,providerInvoiceId:1}], [Document,{organizationId:1,storageKey:1}],
  ] as const;
  for (const [model, key] of required) {
    let indexes; try { indexes = await model.collection.indexes(); } catch { throw new AppError(503, 'CONTRACT_INDEXES_REQUIRED', 'Initialize contract indexes before onboarding'); }
    if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(key))) throw new AppError(503, 'CONTRACT_INDEXES_REQUIRED', 'Initialize contract indexes before onboarding');
  }
}
