import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsDateOnly } from '../../common/validation/decorators';
import { REPORT_PERIODS, type ReportPeriodName } from './report-period';

/**
 * Filter shared by every report: organization (from the tenant context),
 * branch, and a period — a named one or a custom `from`/`to`.
 */
export class ReportQueryDto {
  @ApiProperty({ enum: REPORT_PERIODS, required: false, default: 'month' })
  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriodName;

  /** Custom period start (YYYY-MM-DD, organization calendar). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Custom period end, inclusive. */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  /** Limit to one branch (default: the selected `X-Branch-Id`, else all accessible). */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Reports that return ranked rows (groups, students, employees, debtors). */
export class ReportPageQueryDto extends ReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ReportPeriodDto {
  @ApiProperty({ enum: REPORT_PERIODS })
  name!: ReportPeriodName;
  from!: string;
  to!: string;
  timezone!: string;
}
