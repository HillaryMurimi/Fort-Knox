import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/database/models/User.js';
import { startAdminMfa, verifyAdminMfa, finishAdminEnrollment, registerAdminFailure } from '../src/modules/auth/admin-mfa.service.js';
import { securityAudit } from '../src/modules/auth/admin-security.js';
// Host-only enrollment/recovery. No password or OTP command-line arguments.
const args = process.argv.slice(2), id = args[0], caseId = args[1];
if (!id || !Types.ObjectId.isValid(id) || !caseId || !/^[A-Za-z0-9_-]{8,80}$/.test(caseId))
  throw new Error('Usage: auth:enroll-admin -- <existing-user-id> <approved-case-reference>');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Enrollment requires an interactive secure terminal.');
const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
const input = createInterface({ input: process.stdin, output: silent, terminal: true });
async function secret(prompt: string) { process.stdout.write(prompt); const value = await input.question(''); process.stdout.write('\n'); return value; }
try {
  await connectDatabase();
  const user = await User.findById(id).select('+passwordHash');
  if (!user?.isPlatformAdmin || !user.passwordHash || !(await bcrypt.compare(await secret('Current administrator password (hidden): '), user.passwordHash))) {
    if (user?.isPlatformAdmin) await registerAdminFailure(user._id, {}, 'PASSWORD');
    throw new Error('Credential verification failed.');
  }
  await securityAudit('enrollment_initiated', user._id, {}, { caseId, mechanism: 'HOST_OPERATOR' });
  const flow = await startAdminMfa(user._id, {}, { purpose: 'ENROLLMENT' });
  if (flow.challenge.delivery !== 'SENT') throw new Error('Email provider delivery failed.');
  const email = await verifyAdminMfa(flow.flowToken, 'EMAIL', await secret('Email code (hidden): '));
  if (email.complete || email.challenge.challenge.delivery !== 'SENT') throw new Error('SMS provider delivery failed.');
  const sms = await verifyAdminMfa(flow.flowToken, 'SMS', await secret('SMS code (hidden): '));
  if (!sms.complete) throw new Error('Both channels must be verified.');
  await finishAdminEnrollment(sms.flowId, caseId);
  process.stdout.write('Dual-channel verification recorded; previous sessions revoked. Sign in through the normal application.\n');
} catch { process.stderr.write('Enrollment failed; no session was granted. Review the audited case and provider configuration.\n'); process.exitCode = 1; }
finally { input.close(); await disconnectDatabase(); }
