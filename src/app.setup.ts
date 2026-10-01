import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/context/request-context';
import { type EnvironmentVariables } from './config/env.validation';

/** Every business route lives under this prefix; a V2 would be mounted next to it. */
export const API_PREFIX = 'api/v1';

/** HTTP-level hardening shared by `main.ts` and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  // Behind a reverse proxy, req.ip (rate limiting, audit) must come from X-Forwarded-For.
  if (trustProxy) (app as NestExpressApplication).set('trust proxy', parseTrustProxy(trustProxy));

  app.use(requestContextMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Organization-Id',
      'X-Branch-Id',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
  });
  // Health stays at the root for load balancers and container healthchecks.
  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'health', method: RequestMethod.GET }] });
}

/** "1" / "2" → hop count, "true" → trust all, anything else → Express preset or subnet list. */
function parseTrustProxy(value: string): number | boolean | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  return value;
}
