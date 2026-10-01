import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

/**
 * Brings the *test* database (DATABASE_URL from .env.test) to the latest
 * migration and seeds system roles/permissions. Runs once per e2e run.
 */
export default function globalSetup(): void {
  const { parsed } = loadEnv({ path: '.env.test', override: true });
  if (!parsed?.DATABASE_URL)
    throw new Error('.env.test with DATABASE_URL is required for e2e tests');
  if (!/test/i.test(parsed.DATABASE_URL)) {
    throw new Error(
      'Refusing to run e2e tests: DATABASE_URL in .env.test must point to a *test* database',
    );
  }

  const env = { ...process.env, ...parsed, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('npx prisma db seed', { env, stdio: 'inherit' });
}
