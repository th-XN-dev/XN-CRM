import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus, EnrollmentStatus } from '@prisma/client';

class NamedRefDto {
  id!: string;
  name!: string;
}

class PersonRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

export class AttendanceResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  enrollmentId!: string;
  groupId!: string;
  date!: Date;
  @ApiProperty({ enum: AttendanceStatus })
  status!: AttendanceStatus;
  checkInAt!: Date | null;
  note!: string | null;
  markedById!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class StudentAttendanceItemDto extends AttendanceResponseDto {
  group!: NamedRefDto;
}

export class MarkAttendanceResultDto {
  groupId!: string;
  date!: Date;
  created!: number;
  updated!: number;
  records!: AttendanceResponseDto[];
}

class RosterEnrollmentDto {
  id!: string;
  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;
  startedAt!: Date;
  endedAt!: Date | null;
}

class RosterAttendanceDto {
  id!: string;
  @ApiProperty({ enum: AttendanceStatus })
  status!: AttendanceStatus;
  checkInAt!: Date | null;
  note!: string | null;
  markedById!: string;
}

class RosterEntryDto {
  student!: PersonRefDto;
  enrollment!: RosterEnrollmentDto;
  /** `null` = not marked yet. */
  attendance!: RosterAttendanceDto | null;
}

class RoomRefDto extends NamedRefDto {
  code!: string;
}

export class GroupAttendanceDto {
  group!: NamedRefDto;
  date!: Date;
  teacher!: PersonRefDto | null;
  room!: RoomRefDto | null;
  students!: RosterEntryDto[];
}

export class StudentAttendanceStatsDto {
  studentId!: string;
  from!: string | null;
  to!: string | null;
  totalLessons!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  /** (PRESENT + LATE) / totalLessons × 100; null without marks. @example 87.5 */
  attendancePercentage!: number | null;
}

export class GroupAttendanceStatsDto {
  groupId!: string;
  from!: string | null;
  to!: string | null;
  /** Distinct lesson dates with at least one mark. */
  lessonsCount!: number;
  totalAttendance!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  /** (PRESENT + LATE) / totalAttendance × 100; null without marks. */
  averageAttendance!: number | null;
}
