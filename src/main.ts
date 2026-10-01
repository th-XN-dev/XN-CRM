import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { type EnvironmentVariables, NodeEnv } from './config/env.validation';
import { NotificationActivity } from './notifications/handlers/notification-activity';
import { setupSwagger } from './swagger';

type Config = ConfigService<EnvironmentVariables, true>;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<Config>(ConfigService);
  configureApp(app);
  if (config.get('NODE_ENV', { infer: true }) !== NodeEnv.Production) {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  handleShutdownSignals(app, config.get('SHUTDOWN_TIMEOUT_MS', { infer: true }));
  app.get(Logger).log(`XN CRM API listening on http://localhost:${port} (docs: /api/v1/docs)`);
}

/**
 * SIGTERM/SIGINT → stop accepting connections → let in-flight requests and
 * event handlers finish → close the queue (Redis) and Prisma (app.close runs
 * the module destroy hooks) → exit. A hard timeout bounds the whole sequence.
 */
function handleShutdownSignals(app: INestApplication, timeoutMs: number): void {
  const logger = app.get(Logger);
  let closing = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.log(`${signal} received: shutting down gracefully`);
    const force = setTimeout(() => {
      logger.error(`Graceful shutdown exceeded ${timeoutMs} ms; forcing exit`);
      process.exit(1);
    }, timeoutMs);
    force.unref();

    try {
      const server = app.getHttpServer() as Server;
      await new Promise<void>((resolve) => {
        server.close(() => resolve()); // resolves once in-flight requests are done
        server.closeIdleConnections(); // drop idle keep-alive sockets right away
      });
      await app.get(NotificationActivity).idle({ includeQueue: false });
      await app.close();
      logger.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error(`Shutdown failed: ${String(error)}`);
      process.exit(1);
    }
  };

  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));
}

void bootstrap();
