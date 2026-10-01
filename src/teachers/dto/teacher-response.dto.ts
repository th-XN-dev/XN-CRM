import { ApiProperty } from '@nestjs/swagger';
import { GroupStatus, TeacherStatus } from '@prisma/client';

class TeacherBranchRefDto {
  id!: string;
  name!: string;
}

export class TeacherResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  userId!: string | null;
  firstName!: string;
  lastName!: string;
  phone!: string | null;
  @ApiProperty({ enum: TeacherStatus })
  status!: TeacherStatus;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  branch!: TeacherBranchRefDto;
}

class TeacherGroupRefDto {
  id!: string;
  name!: string;
  @ApiProperty({ enum: GroupStatus })
  status!: GroupStatus;
  branchId!: string;
}

export class TeacherDetailDto extends TeacherResponseDto {
  /** Active and paused groups led by the teacher. */
  groups!: TeacherGroupRefDto[];
}
