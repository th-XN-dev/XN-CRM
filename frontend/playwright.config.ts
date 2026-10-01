import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;

/**
 * Browser smoke tests. Starts its own API instance (built backend in `..`,
 * dev database from its .env) with relaxed rate limits — a whole suite logs in
 * more often than the real per-minute auth limit allows — and a Vite server
 * proxying to it. A developer's own servers on 3000/5173 are left alone.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'uz-UZ',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'node dist/main',
      cwd: '..',
      url: `http://localhost:${API_PORT}/health`,
      env: { PORT: String(API_PORT), AUTH_THROTTLE_LIMIT: '100000', THROTTLE_LIMIT: '100000', LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_DEV_API_PROXY: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
