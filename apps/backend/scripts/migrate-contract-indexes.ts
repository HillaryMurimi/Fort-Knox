import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { ContractTemplate } from '../src/database/models/ContractTemplate.js';
import { OrganizationContract } from '../src/database/models/OrganizationContract.js';
import { OrganizationSubscription } from '../src/database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../src/database/models/SubscriptionInvoice.js';
import { BillingEvent } from '../src/database/models/BillingEvent.js';
import { Document } from '../src/database/models/Document.js';
import { Evidence } from '../src/database/models/Evidence.js';
import { PlatformSwitch } from '../src/database/models/PlatformSwitch.js';

// Dry run by default. Replaces ONLY the four known sparse provider-reference indexes.
// Sparse compound indexes include rows with a provider but no reference, incorrectly
// preventing two unpaid organizations. Partial string-reference uniqueness fixes this.
const apply = process.argv.includes('--apply');
try {
  await connectDatabase();
  if (apply && env.NODE_ENV === 'production') {
    for (const key of ['LANDLORD_ONBOARDING', 'PAYSTACK_PAYMENTS']) {
      const gate = await PlatformSwitch.findOne({ key }).lean();
      if (gate?.mode === 'ON' || gate?.enabled) throw new Error(`Turn ${key} OFF and pause billing workers before index migration`);
    }
  }
  for (const model of [OrganizationSubscription, SubscriptionInvoice, ContractTemplate, OrganizationContract, BillingEvent, Document, Evidence]) {
    let indexes;
    try { indexes = await model.collection.indexes(); } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 26)) throw error;
      indexes = [];
    }
    const references = model === OrganizationSubscription ? ['providerSubscriptionId', 'providerCheckoutReference', 'providerPlanCode'] : model === SubscriptionInvoice ? ['providerInvoiceId'] : [];
    const replacements = indexes.filter(index => index.unique && index.sparse && index.key.provider === 1 && references.some(reference => index.key[reference] === 1) && Object.keys(index.key).length === 2);
    console.log(JSON.stringify({ collection: model.collection.name, apply, replaceKnownIndexes: replacements.map(index => index.name), declaredIndexes: model.schema.indexes().length }));
    if (apply) {
      await model.createCollection();
      for (const index of replacements) await model.collection.dropIndex(index.name!);
      await model.createIndexes();
    }
  }
} finally { await disconnectDatabase(); }
