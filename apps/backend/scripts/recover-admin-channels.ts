import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { z } from 'zod';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/database/models/User.js';
import { RefreshSession } from '../src/database/models/RefreshSession.js';
import { AdminAuthFlow } from '../src/database/models/AdminAuthFlow.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
// Explicit host-operator recovery, after the independently approved identity
// review documented in SUPER_ADMIN_AUTHENTICATION.md. It grants NO session.
const [id, caseId] = process.argv.slice(2);
if (!id || !Types.ObjectId.isValid(id) || !caseId || !/^[A-Za-z0-9_-]{8,80}$/.test(caseId)) throw new Error('Usage: auth:recover-admin-channels -- <existing-user-id> <approved-case-reference>');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Recovery requires an interactive authorized host terminal.');
const input = createInterface({ input: process.stdin, output: new Writable({ write(_chunk, _encoding, done) { done(); } }), terminal: true });
async function hidden(prompt: string) { process.stdout.write(prompt); const value = await input.question(''); process.stdout.write('\n'); return value; }
try {
  await connectDatabase();
  const account = await User.findById(id).select('+passwordHash');
  if (!account?.isPlatformAdmin || !account.passwordHash || !(await bcrypt.compare(await hidden('Current administrator password (hidden): '), account.passwordHash)))
    throw new Error('Existing administrator password proof is required.');
  const email = z.string().email().parse((await hidden('Approved replacement email (hidden): ')).trim().toLowerCase());
  const phone = z.string().regex(/^\+[1-9]\d{7,14}$/).parse((await hidden('Approved replacement international phone (hidden): ')).replace(/[\s()-]/g, ''));
  const confirmation = await hidden('Confirm approved identity-review case by entering its reference (hidden): ');
  if (confirmation !== caseId) throw new Error('Case confirmation did not match.');
  await mongoose.connection.transaction(async session => {
    const updated = await User.findOneAndUpdate({ _id: account._id, isPlatformAdmin: true, status: 'ACTIVE' }, {
      $set: { email, phone, authFailureCount: 0 }, $inc: { authVersion: 1, authFlowGeneration: 1 },
      $unset: { emailVerifiedAt: 1, phoneVerifiedAt: 1, mfaContactsHash: 1, authLockedUntil: 1, authFailureWindowAt: 1 }
    }, { returnDocument: 'after', session });
    if (!updated) throw new Error('Account changed during recovery.');
    await RefreshSession.updateMany({ userId: account._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }, { session });
    await AdminAuthFlow.updateMany({ userId: account._id, stage: { $in: ['CHANNEL', 'EMAIL', 'SMS', 'VERIFIED'] } }, { $set: { stage: 'INVALIDATED' } }, { session });
    await AuditService.record({ actorUserId: account._id, actorRole: 'SUPER_ADMIN', action: 'auth.super_admin.recovery_destinations_staged',
      resourceType: 'User', resourceId: account._id, metadata: { caseId, mechanism: 'HOST_OPERATOR_AND_CURRENT_PASSWORD', dualChannelEnrollmentRequired: true } }, session);
  });
  process.stdout.write('Recovery destinations staged and prior access revoked. Run auth:enroll-admin for the same case; both new channels must be verified before login.\n');
} catch { process.stderr.write('Recovery failed; no administrator access was granted. Review the approved case without logging credentials.\n'); process.exitCode = 1; }
finally { input.close(); await disconnectDatabase(); }
