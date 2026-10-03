import { PRODUCT_NAME } from './config/brand.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttpModule from 'pino-http';
import type { Request, RequestHandler } from 'express';
import morgan from 'morgan';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './core/logging/logger.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { auditRequestMiddleware } from './middleware/audit-request.middleware.js';
import { metricsMiddleware } from './core/observability/metrics.js';
import { idempotencyMiddleware } from './modules/idempotency/idempotency.middleware.js';
import { buildOpenApiDocument } from './core/api/openapi.js';
import { publicRateLimit, authRateLimit } from './core/api/rate-limits.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware());
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { (req as Express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(publicRateLimit);
  const pinoHttp = pinoHttpModule as unknown as (options: { logger: typeof logger; genReqId: (req: Request) => string }) => RequestHandler;
  app.use(pinoHttp({ logger, genReqId: (req) => req.requestId ?? randomUUID() }));
  if (env.NODE_ENV !== 'test') app.use(morgan('combined', { skip: (req) => req.path.startsWith(`${env.API_PREFIX}/auth`) }));

  app.get('/', (_req, res) => res.json({ success: true, data: { name: `${PRODUCT_NAME} Property Command Center API`, version: 'v1' } }));
  app.use(`${env.API_PREFIX}/auth`, authRateLimit);
  app.get(`${env.API_PREFIX}/openapi.json`, (_req, res) => res.json(buildOpenApiDocument()));
  app.use(env.API_PREFIX, idempotencyMiddleware, auditRequestMiddleware, apiRouter);
  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorMiddleware);
  return app;
}
