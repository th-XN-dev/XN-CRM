import { IsOptional, IsUUID } from 'class-validator';
import { ReportPageQueryDto, ReportQueryDto } from '../common/report-query.dto';

export class StudentReportQueryDto extends ReportQueryDto {
  /** Only students currently enrolled in this course. */
  @IsOptional()
  @IsUUID()
  courseId?: string;

  /** Only students currently enrolled in this group. */
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class AttendanceReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** The group's teacher. */
  @IsOptional()
  @IsUUID()
  teacherId?: string;
}

export class AttendanceRankingQueryDto extends ReportPageQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}
