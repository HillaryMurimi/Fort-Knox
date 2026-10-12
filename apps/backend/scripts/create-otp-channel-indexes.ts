import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { OtpChallenge } from '../src/database/models/OtpChallenge.js';
import { TenantOnboarding } from '../src/database/models/TenantOnboarding.js';
import { PlatformSwitch } from '../src/database/models/PlatformSwitch.js';
try {
  await connectDatabase();
  for (const model of [OtpChallenge, TenantOnboarding, PlatformSwitch]) await model.createIndexes();
  process.stdout.write('OTP channel lookup/uniqueness indexes initialized; existing records and indexes retained.\n');
} finally { await disconnectDatabase(); }
