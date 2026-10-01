import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';
import { IsMoney } from '../../common/validation/decorators';

export const CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
export const CODE_MESSAGE = 'code may contain letters, digits, "-" and "_" (max 32 chars)';

export class CreateCourseDto {
  /** @example "Mathematics" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Unique within the organization, stored upper-case. @example "MATH" */
  @Transform(toUpperTrimmed)
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Default monthly price for new groups. @example 450000 */
  @Type(() => Number)
  @IsMoney()
  monthlyPrice!: number;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCoursesQueryDto extends ListQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['name', 'code', 'createdAt'])
  sortBy: 'name' | 'code' | 'createdAt' = 'name';

  override sortOrder: 'asc' | 'desc' = 'asc';
}
