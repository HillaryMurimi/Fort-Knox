import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { JobService } from '../src/modules/jobs/job.service.js';

await connectDatabase();
try {
  const result = await JobService.runDueJobs(50);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await disconnectDatabase();
}
