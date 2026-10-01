import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';
import { CODE_MESSAGE, CODE_REGEX } from './course.dto';

export class CreateLevelDto {
  /** @example "Foundation" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Unique within the course. @example "F1" */
  @Transform(toUpperTrimmed)
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Display/progression order within the course. @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  order?: number;
}

export class UpdateLevelDto extends PartialType(CreateLevelDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListLevelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
