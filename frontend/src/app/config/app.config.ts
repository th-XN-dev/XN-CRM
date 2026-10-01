import type { Locale } from '@/types/domain';

/**
 * Application-wide constants. The brand color here is only the fallback used
 * before an organization is selected; afterwards the organization's own
 * primaryColor drives the whole palette.
 */
export const appConfig = {
  name: 'XN CRM',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  environment: import.meta.env.VITE_APP_ENV ?? (import.meta.env.PROD ? 'production' : 'development'),
  version: __APP_VERSION__,
  /** Where client errors are reported (empty = off). */
  errorReportingUrl: import.meta.env.VITE_ERROR_REPORTING_URL || null,
  defaultBrandColor: '#4F46E5',
  defaultLocale: 'uz' as Locale,
  locales: ['uz', 'ru', 'en'] as const satisfies readonly Locale[],
  /** Debounce for search inputs (ms). */
  searchDebounceMs: 300,
  /** TanStack Query: data is fresh for 30 s, kept 5 min. */
  query: { staleTime: 30_000, gcTime: 5 * 60_000 },
} as const;

export const storageKeys = {
  refreshToken: 'xn.auth.refresh',
  session: 'xn.session',
  theme: 'xn.theme',
  locale: 'xn.locale',
  sidebarCollapsed: 'xn.sidebar.collapsed',
} as const;
