import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export const FOLLOW_UP_FILTERS = ['today', 'overdue', 'upcoming'] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

/**
 * Leads with a follow-up due. `filter` selects the window relative to "now" in
 * the organization timezone; omitting it returns every open lead that has a
 * follow-up set.
 */
export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(FOLLOW_UP_FILTERS)
  filter?: FollowUpFilter;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}
