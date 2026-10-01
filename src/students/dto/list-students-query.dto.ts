import { ApiProperty } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListStudentsQueryDto extends ListQueryDto {
  @ApiProperty({ enum: StudentStatus, required: false })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  /** Students with an ACTIVE enrollment in this group. */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** Students with an ACTIVE enrollment in a group of this course. */
  @IsOptional()
  @IsUUID()
  courseId?: string;

  /** Students with an ACTIVE enrollment in a group of this level. */
  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsIn(['lastName', 'firstName', 'joinedAt', 'createdAt'])
  sortBy: 'lastName' | 'firstName' | 'joinedAt' | 'createdAt' = 'createdAt';
}
