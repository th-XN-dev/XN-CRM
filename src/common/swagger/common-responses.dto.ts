export class PaginationMetaDto {
  /** @example 1 */
  page!: number;
  /** @example 20 */
  limit!: number;
  /** @example 120 */
  total!: number;
  /** @example 6 */
  totalPages!: number;
}

export class ErrorResponseDto {
  /** @example false */
  success!: boolean;
  /** @example "Group capacity is full" */
  message!: string;
  /** @example "GROUP_CAPACITY_FULL" */
  code!: string;
}
