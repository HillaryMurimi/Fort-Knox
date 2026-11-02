import { createHash } from 'node:crypto';
import type { ClientSession, Types } from 'mongoose';
import { Job } from '../../database/models/Job.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
export async function signalSalesFollowUps(leadId: Types.ObjectId, sourceKey: string, session?: ClientSession) {
  if (!await PlatformSwitch.exists({ key: 'SALES_FOLLOWUPS', enabled: true, mode: 'ON' }).session(session ?? null)) return;
  const key = createHash('sha256').update(String(leadId) + ':' + sourceKey).digest('hex');
  await Job.updateOne({ dedupeKey: 'sales-followup-signal:' + key }, { $setOnInsert: { type: 'sales.followup.signal', payload: { leadId: String(leadId) }, availableAt: new Date(), maxAttempts: 5 } }, { upsert: true, ...(session ? { session } : {}) });
}
