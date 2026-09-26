import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { JobService } from '../src/modules/jobs/job.service.js';

const pollMs = Math.max(1000, Number(process.env.JOB_POLL_INTERVAL_MS ?? 10000));
const batchSize = Math.max(1, Math.min(100, Number(process.env.JOB_BATCH_SIZE ?? 25)));

await connectDatabase();
let stopping = false;
const stop = () => { stopping = true; };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  while (!stopping) {
    const results = await JobService.runDueJobs(batchSize);
    if (results.length === 0) await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
} finally {
  await disconnectDatabase();
}
