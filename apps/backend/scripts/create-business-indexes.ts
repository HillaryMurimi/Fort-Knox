import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { PlatformBrief } from "../src/database/models/PlatformBrief.js";
import { OrganizationSubscription } from "../src/database/models/OrganizationSubscription.js";
import { Organization } from "../src/database/models/Organization.js";
import { SubscriptionInvoice } from "../src/database/models/SubscriptionInvoice.js";
await connectDatabase();
try {
  await PlatformBrief.createIndexes();
  // Add only indexes for these report access paths; never synchronize/drop unrelated indexes.
  for (const model of [
    OrganizationSubscription,
    Organization,
    SubscriptionInvoice,
  ])
    for (const [key, options] of model.schema.indexes())
      if (options.name?.startsWith("platform_bi_"))
        await model.collection.createIndex(key, options);
  process.stdout.write(
    "Platform brief and explicitly named business reporting indexes created\n",
  );
} finally {
  await disconnectDatabase();
}
