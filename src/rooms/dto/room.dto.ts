import { PartialType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';
import { CODE_MESSAGE, CODE_REGEX } from '../../courses/dto/course.dto';

export class CreateRoomDto {
  /** Defaults to the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** @example "Room 101" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Unique within the branch, stored upper-case. @example "101" */
  @Transform(toUpperTrimmed)
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  code!: string;

  /** Seats. @example 16 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
}

/** A room never moves between branches (schedules and groups depend on it). */
export class UpdateRoomDto extends PartialType(OmitType(CreateRoomDto, ['branchId'] as const)) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListRoomsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['code', 'name', 'createdAt'])
  sortBy: 'code' | 'name' | 'createdAt' = 'code';

  override sortOrder: 'asc' | 'desc' = 'asc';
}
