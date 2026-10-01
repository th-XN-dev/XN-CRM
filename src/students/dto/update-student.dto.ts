import { ApiProperty, PartialType } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StudentProfileDto } from './create-student.dto';

export class UpdateStudentDto extends PartialType(StudentProfileDto) {
  /** Move to another family of the organization. */
  @IsOptional()
  @IsUUID()
  familyId?: string;

  /** Change home branch — only while the student has no active enrollment (use transfer otherwise). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /**
   * Lifecycle change. GRADUATED closes the active enrollment as COMPLETED,
   * LEFT closes it as CANCELLED; FROZEN keeps the seat.
   */
  @ApiProperty({ enum: StudentStatus, required: false })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
