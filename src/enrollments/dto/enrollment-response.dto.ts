import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';

class StudentRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

class NamedRefDto {
  id!: string;
  name!: string;
}

class GroupRefDto extends NamedRefDto {
  branch!: NamedRefDto;
  course!: NamedRefDto;
  level!: NamedRefDto | null;
}

export class EnrollmentResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  studentId!: string;
  groupId!: string;
  startedAt!: Date;
  endedAt!: Date | null;
  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;
  notes!: string | null;
  /** Previous enrollment when created by a transfer. */
  transferredFromId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  student!: StudentRefDto;
  group!: GroupRefDto;
}

export class TransferResultDto {
  /** The closed enrollment (status TRANSFERRED). */
  previous!: EnrollmentResponseDto;
  /** The new ACTIVE enrollment. */
  current!: EnrollmentResponseDto;
}
