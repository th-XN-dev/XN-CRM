import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { appConfig } from '@/app/config/app.config';
import type { ApiSuccess } from '@/types/api';
import { ApiError, isApiErrorBody } from './api-error';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not try to refresh the session on 401 (auth endpoints). */
    skipAuthRefresh?: boolean;
    /** Do not send X-Organization-Id / X-Branch-Id (account-level calls). */
    skipTenant?: boolean;
  }
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

/**
 * Hooks the stores plug in at startup, so this module has no dependency on
 * Pinia (no import cycles, easy to test).
 */
export interface HttpHooks {
  getAccessToken(): string | null;
  getTenant(): { organizationId: string | null; branchId: string | null };
  getLocale(): string;
  /** Resolves a fresh access token, or null when the session is over. */
  refresh(): Promise<string | null>;
  /** Called once refresh has failed: the user must sign in again. */
  onSessionExpired(): void;
  /**
   * 403 that is about the account or the whole center, not the request:
   * the center was frozen/expired meanwhile, or a temporary password must be
   * replaced first. The app moves the user to the screen that explains it.
   */
  onAccessBlocked?(code: string): void;
}

/** 403 codes that close the whole center (or the account) rather than one action. */
export const ACCESS_BLOCKING_CODES = new Set([
  'CENTER_FROZEN',
  'CENTER_EXPIRED',
  'CENTER_NOT_STARTED',
  'CENTER_ARCHIVED',
  'PASSWORD_CHANGE_REQUIRED',
]);

let hooks: HttpHooks | null = null;

export function configureHttp(value: HttpHooks): void {
  hooks = value;
}

export const http = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

http.interceptors.request.use((config) => {
  // Offline: refuse writes at once (clear message) instead of letting them hang until the timeout.
  const method = (config.method ?? 'get').toLowerCase();
  if (method !== 'get' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Offline');
  }
  const token = hooks?.getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  if (hooks) config.headers.set('Accept-Language', hooks.getLocale());
  if (!config.skipTenant && hooks) {
    const { organizationId, branchId } = hooks.getTenant();
    if (organizationId) config.headers.set('X-Organization-Id', organizationId);
    if (organizationId && branchId) config.headers.set('X-Branch-Id', branchId);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    // 401 → refresh once (shared by concurrent requests) → retry the original request.
    if (
      error.response?.status === 401 &&
      config &&
      !config.skipAuthRefresh &&
      !config._retried &&
      hooks
    ) {
      config._retried = true;
      const token = await hooks.refresh();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
        return http.request(config);
      }
      hooks.onSessionExpired();
    }
    const apiError = toApiError(error);
    if (apiError.status === 403 && ACCESS_BLOCKING_CODES.has(apiError.code)) {
      hooks?.onAccessBlocked?.(apiError.code);
    }
    throw apiError;
  },
);

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const axiosError = error as AxiosError;
  const response = axiosError.response;
  const requestId = response?.headers?.['x-request-id'] as string | undefined;
  if (!response) {
    return new ApiError(0, 'NETWORK_ERROR', axiosError.message ?? 'Network error');
  }
  if (isApiErrorBody(response.data)) {
    const { code, message, details } = response.data;
    return new ApiError(response.status, code, message, details, requestId);
  }
  return new ApiError(response.status, 'UNKNOWN', axiosError.message, undefined, requestId);
}

/** Performs a request and unwraps `{ success, data }`. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiSuccess<T>>(config);
  return response.data.data;
}

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};
