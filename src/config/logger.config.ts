import { randomUUID } from 'node:crypto';
import { type IncomingMessage } from 'node:http';
import { type AppRequest } from '../common/types/request.types';
import { type Params } from 'nestjs-pino';
import { type AppConfigService } from './config.types';
import { NodeEnv } from './env.validation';

/**
 * Structured JSON logs (pretty in development), one line per request with
 * requestId, method, path, status, duration (`responseTime`, ms) and — once
 * authenticated — userId / organizationId / branchId. Secrets are redacted:
 * never log Authorization headers, cookies, passwords, tokens or secrets.
 */
export function buildLoggerOptions(config: AppConfigService): Params {
  const isDev = config.get('NODE_ENV', { infer: true }) === NodeEnv.Development;
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      // requestContextMiddleware has already validated/generated the id.
      genReqId: (req: IncomingMessage) => {
        const header = req.headers['x-request-id'];
        return typeof header === 'string' && header.length <= 128 ? header : randomUUID();
      },
      customProps: (req: IncomingMessage) => {
        const { user, tenant } = req as unknown as AppRequest;
        return {
          userId: user?.id,
          organizationId: tenant?.organizationId,
          branchId: tenant?.branchId ?? undefined,
        };
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-telegram-bot-api-secret-token"]',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.refreshToken',
          '*.accessToken',
          '*.token',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        // Path only: query strings may carry codes or search terms with personal data.
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
    },
  };
}
