import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../src/database/models/SalesDemoSession.js";
import { Organization } from "../src/database/models/Organization.js";
import { AcquisitionJourney } from "../src/database/models/AcquisitionJourney.js";
await connectDatabase();
try {
  for (const model of [SalesDemoSession, SalesValueEvent, AcquisitionJourney])
    await model.createIndexes();
  for (const [key, options] of Organization.schema.indexes())
    if (options.name?.startsWith("guided_pilot_"))
      await Organization.collection.createIndex(key, options);
  process.stdout.write(
    "Sales demo and guided pilot indexes initialized; existing indexes preserved\n",
  );
} finally {
  await disconnectDatabase();
}
