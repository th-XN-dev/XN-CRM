import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';

export class CreateLeadPipelineDto {
  /** @example "Sales Pipeline" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateLeadPipelineDto extends PartialType(CreateLeadPipelineDto) {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLeadStageDto {
  /** @example "Contacted" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Stable machine name, unique per pipeline. @example "CONTACTED" */
  @Transform(toUpperTrimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateLeadStageDto extends PartialType(CreateLeadStageDto) {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class LeadStageResponseDto {
  id!: string;
  organizationId!: string;
  pipelineId!: string;
  name!: string;
  code!: string;
  order!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class LeadPipelineResponseDto {
  id!: string;
  organizationId!: string;
  name!: string;
  isActive!: boolean;
  isDefault!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  @ApiProperty({ type: [LeadStageResponseDto] })
  stages!: LeadStageResponseDto[];
}
