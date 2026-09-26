import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';

async function main() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD || !env.SUPER_ADMIN_PHONE) throw new Error('SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_PHONE are required');
  await connectDatabase();
  try {
    const role = await Role.findOne({ key: 'SUPER_ADMIN', system: true, organizationId: null });
    if (!role) throw new Error('SUPER_ADMIN system role is missing. Run seed:rbac first.');
    const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12);
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { phone: env.SUPER_ADMIN_PHONE.replace(/[\s()-]/g, ''), firstName: env.SUPER_ADMIN_FIRST_NAME, lastName: env.SUPER_ADMIN_LAST_NAME, passwordHash, status: 'ACTIVE', isPlatformAdmin: true, verifiedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`SUPER_ADMIN ready: ${user.email}`);
  } finally { await disconnectDatabase(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
