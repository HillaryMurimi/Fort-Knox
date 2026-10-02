import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { User } from "../src/database/models/User.js";
import { seedPlatformBusinessDemo } from "../src/modules/platform-control/platform-business.demo.js";
await connectDatabase();
try {
  const admin = await User.findOne({ isPlatformAdmin: true, status: "ACTIVE" });
  if (!admin)
    throw new Error(
      "Create an existing SUPER_ADMIN using the documented seed first",
    );
  process.stdout.write(
    JSON.stringify(await seedPlatformBusinessDemo(admin._id)) + "\n",
  );
} finally {
  await disconnectDatabase();
}
