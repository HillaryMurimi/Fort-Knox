import pino from 'pino';
import { env } from '../../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: ['req.headers', 'req.body', 'req.headers.authorization', 'req.headers.cookie', 'req.url', 'req.query', 'res.headers.set-cookie', 'req.body.password', 'req.body.code', 'req.body.flowToken', 'password', 'code', 'flowToken', 'accessToken', 'refreshToken']
});
