import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Unit } from '../src/database/models/Unit.js';
import { Tenancy } from '../src/database/models/Tenancy.js';
import { RentCharge } from '../src/database/models/RentCharge.js';
import { Payment } from '../src/database/models/Payment.js';
import { PaymentAllocation } from '../src/database/models/PaymentAllocation.js';
import { Expense } from '../src/database/models/Expense.js';
import { ServiceChargeAssessment } from '../src/database/models/ServiceChargeAssessment.js';
import { ArrearsCase } from '../src/database/models/ArrearsCase.js';
import { MoveOut } from '../src/database/models/MoveOut.js';
import { MaintenanceRequest } from '../src/database/models/MaintenanceRequest.js';

const collections = [Unit, Tenancy, RentCharge, Payment, PaymentAllocation, Expense,
  ServiceChargeAssessment, ArrearsCase, MoveOut, MaintenanceRequest];

await connectDatabase();
try {
  const present: string[] = [];
  for (const model of collections) {
    if (await model.exists({})) present.push(model.collection.collectionName);
  }
  process.stdout.write(JSON.stringify({ emptyOperationalMoneyCollections: present.length === 0, collectionsWithRecords: present }, null, 2) + '\n');
  if (present.length > 0) process.exitCode = 2;
} finally {
  await disconnectDatabase();
}
