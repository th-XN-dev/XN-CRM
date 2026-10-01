import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean } from '../../common/utils/transforms';

export class ListFamiliesQueryDto extends ListQueryDto {
  /** Filter by primary branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['name', 'createdAt'])
  sortBy: 'name' | 'createdAt' = 'createdAt';
}
