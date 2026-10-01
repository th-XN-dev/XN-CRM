import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `?page=&limit=` — base for every list endpoint. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

/** Pagination + free-text search + sort direction. Subclasses add `sortBy` and filters. */
export class ListQueryDto extends PaginationQueryDto {
  /** Free-text search; every whitespace-separated word must match. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Prisma `skip`/`take` for a page. */
export function pageArgs(query: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}
