export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Serializes as `{ items, meta }`; the response interceptor wraps it in `{ success, data }`. */
export class Paginated<T> {
  readonly meta: PaginationMeta;

  constructor(
    readonly items: T[],
    total: number,
    { page, limit }: { page: number; limit: number },
  ) {
    this.meta = { page, limit, total, totalPages: Math.ceil(total / limit) };
  }
}
