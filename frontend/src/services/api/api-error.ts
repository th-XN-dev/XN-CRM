import type { ApiErrorBody, FieldError } from '@/types/api';

/**
 * Every failed request becomes an ApiError with the backend's stable `code`.
 * Network failures (no response) use status 0 and code NETWORK_ERROR.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** X-Request-ID of the failed request — quote it to support. */
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isValidation(): boolean {
    return this.status === 422;
  }

  /** Validation messages per field (422 `details`). */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as FieldError[])
        .filter((d) => typeof d?.field === 'string' && Array.isArray(d.errors))
        .map((d) => [d.field, d.errors[0] ?? '']),
    );
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ApiErrorBody).success === false &&
    typeof (value as ApiErrorBody).code === 'string'
  );
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
