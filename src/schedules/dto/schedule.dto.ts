import { ApiProperty, PartialType } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean } from '../../common/utils/transforms';
import { IsTimeOfDay } from '../../common/validation/decorators';

export class CreateScheduleDto {
  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  /** Local time in the organization's timezone. @example "18:30" */
  @IsTimeOfDay()
  startTime!: string;

  /** Must be after `startTime`. @example "20:00" */
  @IsTimeOfDay()
  endTime!: string;

  /** Defaults to the group's room; `null` = no room. Must be in the group's branch. */
  @IsOptional()
  @IsUUID()
  roomId?: string | null;
}

export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {
  /** Re-activating re-runs the conflict checks. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListSchedulesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

/** The weekly timetable across groups; every filter is optional. */
export class TimetableQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}
