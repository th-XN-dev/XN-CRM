import { ApiProperty } from '@nestjs/swagger';
import { Gender, StudentStatus } from '@prisma/client';

export class StudentResponseDto {
  id!: string;
  organizationId!: string;
  familyId!: string;
  branchId!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  birthDate!: Date | null;
  @ApiProperty({ enum: Gender, nullable: true })
  gender!: Gender | null;
  phone!: string | null;
  @ApiProperty({ enum: StudentStatus })
  status!: StudentStatus;
  joinedAt!: Date;
  leftAt!: Date | null;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

class NamedRefDto {
  id!: string;
  name!: string;
}

class FamilyRefDto extends NamedRefDto {
  phone!: string;
}

class ActiveEnrollmentRefDto {
  id!: string;
  startedAt!: Date;
  group!: NamedRefDto;
}

export class StudentListItemDto extends StudentResponseDto {
  family!: FamilyRefDto;
  branch!: NamedRefDto;
}

export class StudentDetailDto extends StudentListItemDto {
  /** Current ACTIVE enrollment, if any. */
  activeEnrollment!: ActiveEnrollmentRefDto | null;
}
