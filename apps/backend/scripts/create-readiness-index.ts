import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { LaunchReadiness } from '../src/database/models/LaunchReadiness.js';

// Add declared indexes only; never drop existing indexes or modify review data.
try {
  await connectDatabase();
  await LaunchReadiness.createCollection();
  await LaunchReadiness.createIndexes();
} finally {
  await disconnectDatabase();
}
