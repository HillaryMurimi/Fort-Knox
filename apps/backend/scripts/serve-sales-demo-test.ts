// Test-only HTTP fixture server used by the real browser verification script.
import { setAdminMfaTestDelivery } from "../src/modules/auth/admin-mfa.service.js";
import { contactsHash } from "../src/modules/auth/admin-security.js";
import { env } from "../src/config/env.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { User } from "../src/database/models/User.js";
import { SubscriptionPlan } from "../src/database/models/SubscriptionPlan.js";
import { PlatformBrief } from "../src/database/models/PlatformBrief.js";
import { Role } from "../src/database/models/Role.js";
import { SYSTEM_ROLES } from "../src/modules/roles/role.catalog.js";
if (env.NODE_ENV !== "test" || !process.env.PCC_SALES_TEST_PASSWORD)
  throw new Error("This server is strictly for isolated browser tests");
await mongoose.connect(env.MONGODB_URI, { autoIndex: false });
if (!mongoose.connection.name.endsWith("-test"))
  throw new Error("Browser fixtures require an isolated -test database");
for (const model of Object.values(mongoose.models))
  await model.createCollection();
await PlatformBrief.createIndexes();
await User.create({
  phone: "+254700009130",
  email: "platform-browser@example.test",
  firstName: "Browser",
  lastName: "Admin",
  isPlatformAdmin: true,
  passwordHash: await bcrypt.hash(process.env.PCC_SALES_TEST_PASSWORD, 10),
  verifiedAt: new Date(),
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: new Date(),
  mfaContactsHash: contactsHash(
    "platform-browser@example.test",
    "+254700009130",
  ),
});
for (const key of ["CONTROL", "FORT_KNOX"])
  await SubscriptionPlan.create({
    key,
    name: key === "CONTROL" ? "Control" : "Fort Knox",
    amount: key === "CONTROL" ? 10000 : 30000,
    currency: "KES",
    billingInterval: "MONTH",
    entitlements: {
      maxProperties: -1,
      maxUnits: -1,
      maxUsers: -1,
      maxTenants: -1,
      features: key === "FORT_KNOX" ? ["security", "documents"] : ["documents"],
    },
    metadata: {
      pricingModel: "BASE_PLUS_ACTIVE_UNITS",
      includedUnits: 50,
      additionalUnitAmount: 200,
    },
  });
setAdminMfaTestDelivery(async (channel, _destination, code) => {
  if (!process.send) throw new Error("Private test IPC is required");
  process.send({ type: "PCC_TEST_MFA_DELIVERY", channel, code });
});
for (const [key, value] of Object.entries(SYSTEM_ROLES))
  await Role.create({ ...value, key, system: true, organizationId: null });
await User.create({
  phone: "+254700009131",
  email: "pilot-browser@example.test",
  firstName: "Pilot",
  lastName: "Owner",
  passwordHash: await bcrypt.hash(process.env.PCC_SALES_TEST_PASSWORD!, 10),
  verifiedAt: new Date(),
});
for (const name of [
  "User",
  "Role",
  "Organization",
  "OrganizationMembership",
  "SalesLead",
  "SalesDemoSession",
  "SalesValueEvent",
  "Property",
  "Building",
  "Floor",
  "Unit",
  "Tenancy",
  "RentCharge",
  "AuditLog",
  "PlatformBrief",
])
  await mongoose.models[name]!.createIndexes();
const server = createApp().listen(env.PORT, "127.0.0.1", () =>
  process.stdout.write("SALES_TEST_SERVER_READY\n"),
);
const stop = () => {
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
