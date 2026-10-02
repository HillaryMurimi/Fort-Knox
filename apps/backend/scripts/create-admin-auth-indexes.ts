import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { AdminAuthFlow } from '../src/database/models/AdminAuthFlow.js';
import { OtpChallenge } from '../src/database/models/OtpChallenge.js';
import { RefreshSession } from '../src/database/models/RefreshSession.js';
import { Notification } from '../src/database/models/Notification.js';
const repair = process.argv.includes('--repair-legacy-indexes');
await connectDatabase();
try {
  for (const model of [OtpChallenge, RefreshSession]) {
    await model.createCollection();
    const index = (await model.collection.listIndexes().toArray()).find(item => item.name === 'expiresAt_1');
    if (index && index.expireAfterSeconds !== 0) {
      if (!repair || Object.keys(index.key).length !== 1 || index.key.expiresAt !== 1) throw new Error('Legacy expiry index requires reviewed --repair-legacy-indexes maintenance.');
      const database = model.db.db;
      if (!database) throw new Error('Database connection is unavailable.');
      await database.command({ collMod: model.collection.name, index: { name: 'expiresAt_1', expireAfterSeconds: 0 } });
    }
  }
  await Notification.createCollection();
  const dedupe = (await Notification.collection.listIndexes().toArray()).find(item => item.name === 'dedupeKey_1');
  if (dedupe && (!dedupe.unique || !dedupe.sparse)) {
    if (!repair || Object.keys(dedupe.key).length !== 1 || dedupe.key.dedupeKey !== 1) throw new Error('Legacy dedupe index requires reviewed --repair-legacy-indexes maintenance.');
    const duplicates = await Notification.aggregate([{ $match: { dedupeKey: { $type: 'string' } } }, { $group: { _id: '$dedupeKey', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }]);
    if (duplicates.length) throw new Error('Duplicate notification keys require explicit data review; no data was removed.');
    await Notification.collection.dropIndex('dedupeKey_1');
  }
  for (const model of [AdminAuthFlow, OtpChallenge, RefreshSession, Notification]) await model.createIndexes();
} finally { await disconnectDatabase(); }
