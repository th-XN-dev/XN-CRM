import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { GroupStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { trimString } from '../../common/utils/transforms';
import { IsDateOnly, IsMoney } from '../../common/validation/decorators';

export class CreateGroupDto {
  /** Defaults to the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsUUID()
  courseId!: string;

  /** Must be a level of `courseId`. */
  @IsOptional()
  @IsUUID()
  levelId?: string;

  /** @example "Math F1 — Mon/Wed/Fri 15:00" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Max ACTIVE enrollments. @example 15 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  /** Defaults to the course price. @example 450000 */
  @IsOptional()
  @Type(() => Number)
  @IsMoney()
  monthlyPrice?: number;

  /** Primary teacher (same organization, ACTIVE, in a branch you can access). `null` unassigns. */
  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  /** Primary room; must be an active room of the group's branch. `null` unassigns. */
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  /** @example "2026-10-01" */
  @IsDateOnly()
  startDate!: string;

  @IsOptional()
  @IsDateOnly()
  endDate?: string;
}

/** Branch and course are fixed after creation (enrollment history depends on them). */
export class UpdateGroupDto extends PartialType(
  OmitType(CreateGroupDto, ['branchId', 'courseId'] as const),
) {
  /** COMPLETED/CANCELLED require the group to have no ACTIVE enrollments. */
  @ApiProperty({ enum: GroupStatus, required: false })
  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;
}

export class ListGroupsQueryDto extends ListQueryDto {
  @ApiProperty({ enum: GroupStatus, required: false })
  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsIn(['name', 'startDate', 'createdAt'])
  sortBy: 'name' | 'startDate' | 'createdAt' = 'createdAt';
}
