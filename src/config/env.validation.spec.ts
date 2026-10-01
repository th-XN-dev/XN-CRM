import 'reflect-metadata';
import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'development',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('environment validation', () => {
  it('accepts a minimal development config and applies defaults', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      PORT: 3000,
      NOTIFICATION_MAX_ATTEMPTS: 3,
      SHUTDOWN_TIMEOUT_MS: 15_000,
    });
  });

  it('refuses to boot without required variables', () => {
    const { DATABASE_URL: _db, ...missing } = base;
    expect(() => validateEnv(missing)).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /must be different/,
    );
  });

  it('is stricter in production', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv(prod)).toThrow(/REDIS_URL is required/);
    expect(() =>
      validateEnv({ ...prod, REDIS_URL: 'redis://redis:6379', CORS_ORIGIN: '*' }),
    ).toThrow(/explicit origins/);
    expect(() =>
      validateEnv({
        ...prod,
        REDIS_URL: 'redis://redis:6379',
        JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters',
      }),
    ).toThrow(/example value/);
    expect(validateEnv({ ...prod, REDIS_URL: 'redis://redis:6379' }).NODE_ENV).toBe('production');
  });
});
