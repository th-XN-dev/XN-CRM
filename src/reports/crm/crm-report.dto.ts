import { IsOptional, IsUUID } from 'class-validator';
import { ReportPageQueryDto, ReportQueryDto } from '../common/report-query.dto';

export class LeadReportQueryDto extends ReportQueryDto {
  /** Assignee (user). */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class LeadPipelineReportQueryDto extends LeadReportQueryDto {
  /** Defaults to the organization's default pipeline. */
  @IsOptional()
  @IsUUID()
  pipelineId?: string;
}

export class TaskReportQueryDto extends ReportQueryDto {
  /** Assignee employee. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class TaskEmployeesReportQueryDto extends ReportPageQueryDto {}
