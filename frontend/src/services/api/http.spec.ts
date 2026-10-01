import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { api, configureHttp, http } from './http';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

function useAdapter(handler: Handler) {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    const { status, data } = handler(config);
    const response = { status, data, headers: { 'x-request-id': 'req-1' }, config, statusText: '' };
    if (status >= 400) {
      const error = Object.assign(new Error(`HTTP ${status}`), { config, response, isAxiosError: true });
      throw error;
    }
    return response;
  };
  http.defaults.adapter = adapter;
  return seen;
}

describe('http client', () => {
  let token: string | null;
  const refresh = vi.fn<() => Promise<string | null>>();
  const onSessionExpired = vi.fn();

  beforeEach(() => {
    token = 'old';
    refresh.mockReset();
    onSessionExpired.mockReset();
    configureHttp({
      getAccessToken: () => token,
      getTenant: () => ({ organizationId: 'org-1', branchId: 'br-1' }),
      getLocale: () => 'uz',
      refresh,
      onSessionExpired,
    });
  });
  afterEach(() => {
    http.defaults.adapter = undefined;
  });

  it('unwraps the envelope and sends auth + tenant headers', async () => {
    const seen = useAdapter(() => ({ status: 200, data: { success: true, data: { ok: 1 } } }));
    await expect(api.get('/students')).resolves.toEqual({ ok: 1 });
    const headers = seen[0]!.headers;
    expect(headers.get('Authorization')).toBe('Bearer old');
    expect(headers.get('X-Organization-Id')).toBe('org-1');
    expect(headers.get('X-Branch-Id')).toBe('br-1');
    expect(headers.get('Accept-Language')).toBe('uz');
  });

  it('skips tenant headers for account calls', async () => {
    const seen = useAdapter(() => ({ status: 200, data: { success: true, data: null } }));
    await api.get('/auth/me', { skipTenant: true });
    expect(seen[0]!.headers.get('X-Organization-Id')).toBeUndefined();
  });

  it('401 → one shared refresh → retries every request with the new token', async () => {
    refresh.mockImplementation(async () => {
      token = 'new';
      return 'new';
    });
    const seen = useAdapter((config) =>
      config.headers.get('Authorization') === 'Bearer new'
        ? { status: 200, data: { success: true, data: config.url } }
        : { status: 401, data: { success: false, code: 'UNAUTHORIZED', message: 'x' } },
    );
    await expect(Promise.all([api.get('/a'), api.get('/b')])).resolves.toEqual(['/a', '/b']);
    expect(seen).toHaveLength(4);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('failed refresh → session expired, ApiError 401', async () => {
    refresh.mockResolvedValue(null);
    useAdapter(() => ({ status: 401, data: { success: false, code: 'UNAUTHORIZED', message: 'x' } }));
    await expect(api.get('/a')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('maps error bodies, validation details and network failures', async () => {
    useAdapter(() => ({
      status: 422,
      data: {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'name', errors: ['name should not be empty'] }],
      },
    }));
    const error = (await api.post('/families', {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isValidation).toBe(true);
    expect(error.fieldErrors).toEqual({ name: 'name should not be empty' });
    expect(error.requestId).toBe('req-1');

    http.defaults.adapter = async (config) => {
      throw Object.assign(new Error('Network Error'), { config, isAxiosError: true });
    };
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
