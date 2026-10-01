import { QueryClient } from '@tanstack/vue-query';
import { appConfig } from '@/app/config/app.config';
import { isApiError } from '@/services/api/api-error';

/**
 * Server-state cache. Client errors (4xx) are answers, not glitches — they are
 * never retried; network/5xx failures get one retry.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: appConfig.query.staleTime,
      gcTime: appConfig.query.gcTime,
      refetchOnWindowFocus: false,
      // Back online → stale screens refresh by themselves.
      refetchOnReconnect: true,
      retry: (failureCount, error) =>
        failureCount < 1 && !(isApiError(error) && error.status >= 400 && error.status < 500),
    },
    // Writes never wait for the network to come back: a payment or enrollment
    // must not be sent minutes later behind the user's back. Offline → fail now.
    mutations: { retry: false, networkMode: 'always' },
  },
});
