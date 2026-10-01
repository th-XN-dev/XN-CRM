import type { App } from 'vue';
import type { Router } from 'vue-router';
import { appConfig } from '@/app/config/app.config';
import { isApiError } from '@/services/api/api-error';

interface ClientErrorReport {
  message: string;
  stack?: string;
  /** Route pattern only (e.g. /students/:id) — no ids, query strings or personal data. */
  route?: string;
  source: 'vue' | 'window' | 'promise';
  environment: string;
  release: string;
  userAgent: string;
  at: string;
}

let router: Router | null = null;

/**
 * Sends unexpected client errors to `VITE_ERROR_REPORTING_URL` (any endpoint
 * that accepts JSON — a Sentry tunnel, a log collector…). Off when unset.
 * API errors are expected outcomes (the UI already explains them) and are
 * not reported; reports never contain form data, tokens or record ids.
 */
export function report(error: unknown, source: ClientErrorReport['source']): void {
  const url = appConfig.errorReportingUrl;
  if (!url || isApiError(error)) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const route = router?.currentRoute.value.matched.at(-1)?.path;
  const body: ClientErrorReport = {
    message: err.message.slice(0, 500),
    stack: err.stack?.split('\n').slice(0, 15).join('\n'),
    route,
    source,
    environment: appConfig.environment,
    release: appConfig.version,
    userAgent: navigator.userAgent,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(body);
  if (!navigator.sendBeacon?.(url, new Blob([payload], { type: 'application/json' }))) {
    void fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
  }
}

/** No-op without a reporting URL (development keeps Vue's own error output). */
export function installMonitoring(app: App, appRouter: Router): void {
  if (!appConfig.errorReportingUrl) return;
  router = appRouter;
  app.config.errorHandler = (error) => report(error, 'vue');
  window.addEventListener('error', (event) => report(event.error ?? event.message, 'window'));
  window.addEventListener('unhandledrejection', (event) => report(event.reason, 'promise'));
}
