import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { TeacherStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { trimString } from '../../common/utils/transforms';
import { IsPhone } from '../../common/validation/decorators';

export class CreateTeacherDto {
  /** Home branch. Defaults to the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Login account of the teacher (must be a member of the organization). Enables "own groups" access. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** @example "Dilnoza" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  /** @example "Rahimova" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateTeacherDto extends PartialType(OmitType(CreateTeacherDto, ['userId'] as const)) {
  /** Login account; `null` unlinks it (the teacher loses "own groups" access). */
  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  /** INACTIVE is refused while the teacher still leads active/paused groups. */
  @ApiProperty({ enum: TeacherStatus, required: false })
  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;
}

export class ListTeachersQueryDto extends ListQueryDto {
  @ApiProperty({ enum: TeacherStatus, required: false })
  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(['lastName', 'createdAt'])
  sortBy: 'lastName' | 'createdAt' = 'lastName';

  override sortOrder: 'asc' | 'desc' = 'asc';
}
