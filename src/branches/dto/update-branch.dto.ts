import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

export class UpdateBranchDto extends PartialType(
  OmitType(CreateBranchDto, ['subCenterId'] as const),
) {
  /** Move under another sub-center; null = directly under the center. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  subCenterId?: string | null;

  /** Deactivated branches stay visible in lists but can't be selected as context. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
