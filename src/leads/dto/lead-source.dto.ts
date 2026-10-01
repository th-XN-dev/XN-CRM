import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';

export class CreateLeadSourceDto {
  /** @example "Instagram Ads" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Stable machine name, unique per organization. @example "INSTAGRAM_ADS" */
  @Transform(toUpperTrimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}

export class UpdateLeadSourceDto extends PartialType(CreateLeadSourceDto) {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ListLeadSourcesQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class LeadSourceResponseDto {
  id!: string;
  organizationId!: string;
  name!: string;
  code!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
