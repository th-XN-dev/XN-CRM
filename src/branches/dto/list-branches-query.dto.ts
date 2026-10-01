import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { toBoolean } from '../../common/utils/transforms';

export class ListBranchesQueryDto {
  /** Filter by active flag. Omit to get all branches. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  /** Only branches of this sub-center. */
  @IsOptional()
  @IsUUID()
  subCenterId?: string;
}
