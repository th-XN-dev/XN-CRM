import { ApiProperty } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

class ScheduleRoomRefDto {
  id!: string;
  name!: string;
  code!: string;
}

export class ScheduleResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  groupId!: string;
  roomId!: string | null;
  @ApiProperty({ enum: DayOfWeek })
  dayOfWeek!: DayOfWeek;
  /** Local time (organization timezone). @example "18:30" */
  startTime!: string;
  /** @example "20:00" */
  endTime!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  room!: ScheduleRoomRefDto | null;
}

class TimetableTeacherRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

class TimetableGroupRefDto {
  id!: string;
  name!: string;
  capacity!: number;
  course!: ScheduleRoomRefDto;
  teacher!: TimetableTeacherRefDto | null;
}

/** A lesson slot with its group and teacher, for calendar views. */
export class TimetableSlotDto extends ScheduleResponseDto {
  group!: TimetableGroupRefDto;
}
