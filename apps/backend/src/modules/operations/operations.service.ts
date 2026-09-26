import mongoose from 'mongoose';
import { Job } from '../../database/models/Job.js';
import { snapshotMetrics } from '../../core/observability/metrics.js';

export class OperationsService {
  static async readiness() {
    const database = mongoose.connection.readyState === 1;
    return {
      status: database ? 'ready' : 'not_ready',
      checks: { database: database ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    } as const;
  }

  static async diagnostics() {
    const readiness = await this.readiness();
    const [queuedJobs, runningJobs, failedJobs] = await Promise.all([
      Job.countDocuments({ status: 'QUEUED' }),
      Job.countDocuments({ status: 'RUNNING' }),
      Job.countDocuments({ status: 'FAILED' }),
    ]);
    return {
      status: readiness.status,
      service: 'property-command-center-api',
      version: process.env.npm_package_version ?? 'unknown',
      node: process.version,
      environment: process.env.NODE_ENV ?? 'unknown',
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      database: readiness.checks.database,
      jobs: { queued: queuedJobs, running: runningJobs, failed: failedJobs },
      http: snapshotMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}
