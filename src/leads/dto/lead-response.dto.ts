import { ApiProperty } from '@nestjs/swagger';
import { LeadActivityType, LeadPriority, LeadStatus } from '@prisma/client';

export class LeadResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  name!: string;
  phone!: string;
  secondaryPhone!: string | null;
  sourceId!: string | null;
  stageId!: string | null;
  assignedToId!: string | null;
  @ApiProperty({ enum: LeadStatus })
  status!: LeadStatus;
  @ApiProperty({ enum: LeadPriority })
  priority!: LeadPriority;
  notes!: string | null;
  nextFollowUpAt!: Date | null;
  convertedAt!: Date | null;
  convertedFamilyId!: string | null;
  convertedStudentId!: string | null;
  lostReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

class NamedRefDto {
  id!: string;
  name!: string;
}

class CodedRefDto extends NamedRefDto {
  code!: string;
}

class UserRefDto {
  id!: string;
  name!: string;
}

export class LeadListItemDto extends LeadResponseDto {
  source!: CodedRefDto | null;
  stage!: NamedRefDto | null;
  assignedTo!: UserRefDto | null;
  branch!: NamedRefDto;
}

export class LeadActivityResponseDto {
  id!: string;
  leadId!: string;
  userId!: string | null;
  @ApiProperty({ enum: LeadActivityType })
  type!: LeadActivityType;
  note!: string | null;
  metadata!: Record<string, unknown> | null;
  createdAt!: Date;
  user!: UserRefDto | null;
}

export class LeadDetailDto extends LeadListItemDto {
  @ApiProperty({ type: [LeadActivityResponseDto] })
  recentActivities!: LeadActivityResponseDto[];
}

class ConvertedFamilyDto {
  id!: string;
  name!: string;
}

class ConvertedStudentDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

export class LeadConversionResultDto {
  lead!: LeadResponseDto;
  family!: ConvertedFamilyDto;
  student!: ConvertedStudentDto;
  enrollmentId!: string | null;
}
