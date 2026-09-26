import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { logger } from './core/logging/logger.js';

let shuttingDown = false;

async function bootstrap() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API server started'));

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing process exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(async () => {
      const { disconnectDatabase } = await import('./config/database.js');
      await disconnectDatabase();
      clearTimeout(forceExit);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to bootstrap API');
  process.exit(1);
});
