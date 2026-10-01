import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto, PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { IsDateOnly } from '../../common/validation/decorators';

export class CreateEnrollmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  groupId!: string;

  /** Defaults to today (organization timezone). @example "2026-10-01" */
  @IsOptional()
  @IsDateOnly()
  startedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/** Only notes are editable; status changes go through transfer/cancel. */
export class UpdateEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class TransferEnrollmentDto {
  @IsUUID()
  targetGroupId!: string;

  /** Day the student starts in the new group; the old enrollment ends that day (exclusive). Defaults to today. */
  @IsOptional()
  @IsDateOnly()
  transferDate?: string;

  /** Stored on the new enrollment. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CancelEnrollmentDto {
  /** Defaults to today. */
  @IsOptional()
  @IsDateOnly()
  endedAt?: string;

  /** Replaces the enrollment notes (e.g. cancellation reason). */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ListEnrollmentsQueryDto extends ListQueryDto {
  @ApiProperty({ enum: EnrollmentStatus, required: false })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

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
  @IsIn(['startedAt', 'createdAt'])
  sortBy: 'startedAt' | 'createdAt' = 'startedAt';
}

/** Student history: pagination only, newest first. */
export class StudentHistoryQueryDto extends PaginationQueryDto {}
