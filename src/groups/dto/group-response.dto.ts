import { ApiProperty } from '@nestjs/swagger';
import { GroupStatus } from '@prisma/client';

class RefDto {
  id!: string;
  name!: string;
  code!: string;
}

class TeacherRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

export class GroupResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  courseId!: string;
  levelId!: string | null;
  name!: string;
  capacity!: number;
  /** Decimal serialized as string. @example "450000" */
  monthlyPrice!: string;
  @ApiProperty({ enum: GroupStatus })
  status!: GroupStatus;
  startDate!: Date;
  endDate!: Date | null;
  teacherId!: string | null;
  roomId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  /** Number of ACTIVE enrollments. */
  enrolledCount!: number;
  branch!: RefDto;
  course!: RefDto;
  level!: RefDto | null;
  teacher!: TeacherRefDto | null;
  room!: RefDto | null;
}
