import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { IsDateOnly } from '../../common/validation/decorators';
import { CreateFamilyDto } from '../../families/dto/create-family.dto';
import { StudentProfileDto } from '../../students/dto/create-student.dto';

export class ConvertLeadDto {
  /**
   * Link to an existing family. If neither `familyId` nor `family` is sent, a new
   * family is created from the lead's name and phone. `familyId` and `family`
   * are mutually exclusive.
   */
  @IsOptional()
  @ValidateIf((o: ConvertLeadDto) => o.family === undefined)
  @IsUUID()
  familyId?: string;

  /** Create a new family with explicit data (instead of deriving it from the lead). */
  @IsOptional()
  @ValidateIf((o: ConvertLeadDto) => o.familyId === undefined)
  @ValidateNested()
  @Type(() => CreateFamilyDto)
  family?: CreateFamilyDto;

  /** The student to create for this converted lead. */
  @ValidateNested()
  @Type(() => StudentProfileDto)
  student!: StudentProfileDto;

  /** Enroll the new student into this group (optional). */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** Enrollment start date, defaults to today. @example "2026-10-01" */
  @IsOptional()
  @IsDateOnly()
  startedAt?: string;
}
