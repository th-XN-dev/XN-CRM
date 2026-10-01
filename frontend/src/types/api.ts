/** Envelope of every successful response. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Envelope of every error response. */
export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  /** Validation errors: `[{ field, errors }]`. */
  details?: unknown;
}

export interface FieldError {
  field: string;
  errors: string[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
