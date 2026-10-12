import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { User } from '../src/database/models/User.js';
import { PlatformSwitch } from '../src/database/models/PlatformSwitch.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { authEvidence } from '../src/modules/auth/admin-security.js';
import { registerAdminFailure } from '../src/modules/auth/admin-mfa.service.js';
import { OtpSettingsService } from '../src/modules/auth/otp-settings.service.js';
import { validateOtpSwitchChange } from '../src/modules/auth/otp-policy.js';
import { PlatformControlService } from '../src/modules/platform-control/platform-control.service.js';
const [id, channel, caseId] = process.argv.slice(2);
if (!id || !Types.ObjectId.isValid(id) || !['EMAIL', 'SMS'].includes(channel ?? '') || !caseId || !/^[A-Za-z0-9_-]{8,80}$/.test(caseId))
  throw new Error('Usage: auth:configure-otp -- <existing-admin-user-id> <EMAIL|SMS> <approved-case-reference>');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A trusted interactive terminal is required.');
const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
const input = createInterface({ input: process.stdin, output: silent, terminal: true });
async function secret(prompt: string) { process.stdout.write(prompt); const answer = await input.question(''); process.stdout.write('\n'); return answer; }
try {
  await connectDatabase();
  const account = await User.findById(id).select('+passwordHash');
  if (!account?.isPlatformAdmin || account.status !== 'ACTIVE' || !account.passwordHash || account.authLockedUntil && account.authLockedUntil > new Date() ||
      !await bcrypt.compare(await secret('Existing administrator password (hidden): '), account.passwordHash)) {
    if (account?.isPlatformAdmin) await registerAdminFailure(account._id, {}, 'PASSWORD');
    throw new Error('Credential verification failed');
  }
  await AuditService.record({ actorUserId: account._id, actorRole: 'SUPER_ADMIN', action: 'auth.otp.operator_configuration_started', resourceType: 'Authentication', metadata: { caseId, channel, mechanism: 'HOST_OPERATOR' } });
  // No sessions or destination changes. SMS activation requires BOTH existing verified destinations.
  for (const proofChannel of (channel === 'SMS' ? ['EMAIL', 'SMS'] : ['EMAIL']) as Array<'EMAIL' | 'SMS'>) {
    const test = await OtpSettingsService.startOperatorTest(account._id, proofChannel);
    await OtpSettingsService.verifyOperatorTest(account._id, test.testToken, await secret(proofChannel + ' provider test code (hidden): '));
  }
  if (channel === 'SMS' && !env.SMS_ENABLED) throw new Error('Set SMS_ENABLED=true in the target host configuration before activation.');
  await PlatformControlService.ensureCatalog();
  await mongoose.connection.transaction(async session => {
    await PlatformSwitch.updateOne({ key: 'EMAIL_OTP' }, { $inc: { otpPolicyRevision: 1 } }, { session });
    for (const key of [channel + '_NOTIFICATIONS', channel + '_OTP']) {
      await validateOtpSwitchChange(key, 'ON', session);
      const row = await PlatformSwitch.findOneAndUpdate({ key }, { $set: { enabled: true, mode: 'ON', modifiedBy: account._id,
        modifiedAt: new Date(), reason: 'Audited host activation: ' + caseId } }, { new: true, session });
      await AuditService.record({ actorUserId: account._id, actorRole: 'SUPER_ADMIN', action: 'platform.switch.enabled',
        resourceType: 'PlatformSwitch', resourceId: authEvidence(row)._id, metadata: { key, caseId, mechanism: 'HOST_OPERATOR_RECEIPT_PROOF' } }, session);
    }
  });
  process.stdout.write('Delivery channel activated and audited. No session issued. Use the normal login page.\n');
} catch { process.stderr.write('Channel configuration failed; no session granted. Review the approved case, runtime flags and delivery evidence.\n'); process.exitCode = 1; }
finally { input.close(); await disconnectDatabase(); }
