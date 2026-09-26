import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

// Liveness intentionally does not touch MongoDB: orchestration platforms need
// a cheap signal that the Node process is alive even while dependencies fail.
healthRouter.get('/live', (_req, res) => res.json({
  success: true,
  data: { status: 'ok', service: 'property-command-center-api', timestamp: new Date().toISOString() },
}));

healthRouter.get('/', (_req, res) => res.json({
  success: true,
  data: { status: 'ok', service: 'property-command-center-api', timestamp: new Date().toISOString() },
}));

healthRouter.get('/database', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    success: connected,
    data: { status: connected ? 'ok' : 'down', database: connected ? 'up' : 'down', timestamp: new Date().toISOString() },
  });
});

healthRouter.get('/ready', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    success: connected,
    data: {
      status: connected ? 'ready' : 'not_ready',
      checks: { database: connected ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    },
  });
});
