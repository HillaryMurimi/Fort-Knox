import { MongoInstance } from "mongodb-memory-server-core/lib/util/MongoInstance.js";

// Test processes use loopback TCP; Linux sandboxes may deny Unix socket creation.
if (process.platform !== "win32") {
  const prepare = MongoInstance.prototype.prepareCommandArgs;
  MongoInstance.prototype.prepareCommandArgs = function () {
    return [...prepare.call(this), "--nounixsocket"];
  };
}
