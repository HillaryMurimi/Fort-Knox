import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
await connectDatabase();
console.log(await BillingService.reconcile());
await disconnectDatabase();
process.exit(0);
