import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { AuditService } from '../../modules/audit/audit.service.js';

async function main() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD || !env.SUPER_ADMIN_PHONE) throw new Error('Secure bootstrap environment values are required');
  await connectDatabase();
  try {
    if (!(await Role.exists({ key: 'SUPER_ADMIN', system: true, organizationId: null }))) throw new Error('Run seed:rbac first.');
    const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      if (!existing.isPlatformAdmin) throw new Error('Existing users require the authenticated, audited promotion API.');
      process.stdout.write('Existing administrator preserved. Use auth:enroll-admin for explicit dual-channel enrollment.\n');
      return;
    }
    // Bootstrap initializes an empty platform; it never silently adds a second
    // administrator. Runtime MFA is role-based and supports any account count.
    if (await User.exists({ isPlatformAdmin: true })) throw new Error('Bootstrap refused: an administrator already exists. Use the protected promotion workflow.');
    const user = await User.create({ email, phone: env.SUPER_ADMIN_PHONE.replace(/[\s()-]/g, ''), firstName: env.SUPER_ADMIN_FIRST_NAME,
      lastName: env.SUPER_ADMIN_LAST_NAME, passwordHash: await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12), status: 'ACTIVE', isPlatformAdmin: true });
    await AuditService.record({ actorUserId: user._id, actorRole: 'SUPER_ADMIN', action: 'auth.super_admin.bootstrap_created',
      resourceType: 'User', resourceId: user._id, metadata: { mechanism: 'SECURE_HOST_BOOTSTRAP', enrollmentRequired: true } });
    process.stdout.write('Administrator created; dual-channel enrollment is required. Account ID: ' + user._id + '\n');
  } finally { await disconnectDatabase(); }
}
main().catch(() => { process.stderr.write('Administrator bootstrap failed. Review configuration without logging credentials.\n'); process.exitCode = 1; });
