import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { PlatformMonitorAlert, PlatformMonitorHistory, PlatformMonitorSignal, PlatformHeartbeat, PlatformMaintenanceWindow } from '../src/database/models/PlatformMonitoring.js';
// Adds declared indexes only; no index/data deletion and no provider calls.
try {
  await connectDatabase();
  for (const model of [PlatformMonitorAlert, PlatformMonitorHistory, PlatformMonitorSignal, PlatformHeartbeat, PlatformMaintenanceWindow]) {
    await model.createCollection();
    await model.createIndexes();
  }
} finally { await disconnectDatabase(); }
