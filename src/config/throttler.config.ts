import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { type ThrottlerModuleOptions } from '@nestjs/throttler';
import { type AppConfigService } from './config.types';

const STRICT_THROTTLE_KEY = 'strictThrottle';

/** Applies the stricter `auth` limit (brute-force protection) to a route. */
export const StrictThrottle = (): MethodDecorator => SetMetadata(STRICT_THROTTLE_KEY, true);

/**
 * Two named throttlers, both keyed by client IP:
 *  - `default`: generous limit for every route,
 *  - `auth`:    strict limit, only on routes marked `@StrictThrottle()`.
 * In-memory storage for now; swap in a Redis storage when running >1 instance.
 */
export function buildThrottlerOptions(config: AppConfigService): ThrottlerModuleOptions {
  const ttl = config.get('THROTTLE_TTL_MS', { infer: true });
  return {
    throttlers: [
      { name: 'default', ttl, limit: config.get('THROTTLE_LIMIT', { infer: true }) },
      {
        name: 'auth',
        ttl,
        limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
        skipIf: (context: ExecutionContext) =>
          Reflect.getMetadata(STRICT_THROTTLE_KEY, context.getHandler()) !== true,
      },
    ],
  };
}
