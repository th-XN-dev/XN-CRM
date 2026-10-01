import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../common/validation/decorators';
import { ReportPeriodDto, ReportQueryDto } from '../reports/common/report-query.dto';

/**
 * The dashboard's universal filter: a period (named, custom range or one
 * `date`), then narrower and narrower slices. Every section is recomputed
 * for exactly this slice.
 */
export class DashboardAnalyticsQueryDto extends ReportQueryDto {
  /** One day (shortcut for from = to = date). */
  @IsOptional()
  @IsDateOnly()
  date?: string;

  @IsOptional()
  @IsUUID()
  subCenterId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  /** Teacher (groups they teach: students, attendance, money of those students). */
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  /** Staff member who received payments (user id): money section only. */
  @IsOptional()
  @IsUUID()
  cashierId?: string;
}

/** current vs the previous period of the same length. */
class ComparedNumberDto {
  current!: number;
  previous!: number;
  /** current − previous */
  change!: number;
  /** % change; null when previous is 0. */
  changeRate!: number | null;
}

class ComparedMoneyDto {
  current!: string;
  previous!: string;
  change!: string;
  changeRate!: number | null;
}

class StudentSeriesPointDto {
  bucket!: string;
  newStudents!: number;
}

class StudentsAnalyticsDto {
  total!: number;
  active!: number;
  frozen!: number;
  graduated!: number;
  left!: number;
  newStudents!: ComparedNumberDto;
  series!: StudentSeriesPointDto[];
}

class FinanceSeriesPointDto {
  bucket!: string;
  /** Payments − refunds. */
  income!: string;
  invoiced!: string;
  /** Outstanding at the end of the bucket. */
  debt!: string;
}

class MoneyByUnitDto {
  id!: string;
  name!: string;
  collected!: string;
  debt!: string;
}

class MoneyByCashierDto {
  id!: string;
  name!: string;
  amount!: string;
  payments!: number;
}

class MoneyByMethodDto {
  method!: string;
  amount!: string;
  payments!: number;
}

class FinanceAnalyticsDto {
  /** Invoiced in the period (after discounts). */
  expected!: ComparedMoneyDto;
  /** Payments − refunds in the period. */
  collected!: ComparedMoneyDto;
  paid!: string;
  refunds!: string;
  discounts!: string;
  /** Still owed on invoices issued in the period. */
  unpaid!: string;
  /** Owed now on all open invoices. */
  debt!: string;
  overdueDebt!: string;
  /** Paid in the period for invoices due after it (paid ahead). */
  prepayment!: string;
  series!: FinanceSeriesPointDto[];
  byBranch!: MoneyByUnitDto[];
  bySubCenter!: MoneyByUnitDto[];
  byCashier!: MoneyByCashierDto[];
  byMethod!: MoneyByMethodDto[];
}

class AttendanceSeriesPointDto {
  bucket!: string;
  marks!: number;
  attended!: number;
  rate!: number;
}

class AttendanceByUnitDto {
  id!: string;
  name!: string;
  marks!: number;
  present!: number;
  absent!: number;
  late!: number;
  rate!: number;
}

class AttendanceAnalyticsDto {
  /** Distinct group lessons that have marks. */
  lessons!: number;
  marks!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  rate!: ComparedNumberDto;
  series!: AttendanceSeriesPointDto[];
  byGroup!: AttendanceByUnitDto[];
  byBranch!: AttendanceByUnitDto[];
  byTeacher!: AttendanceByUnitDto[];
}

export class DashboardAnalyticsDto {
  period!: ReportPeriodDto;
  previousPeriod!: ReportPeriodDto;
  @ApiProperty({ enum: ['day', 'month'] })
  granularity!: 'day' | 'month';
  /** null when the caller may not see the section. */
  students!: StudentsAnalyticsDto | null;
  finance!: FinanceAnalyticsDto | null;
  attendance!: AttendanceAnalyticsDto | null;
}

/** Widgets the dashboard knows; the UI decides how each looks. */
export const DASHBOARD_WIDGETS = [
  'attention',
  'kpis',
  'students',
  'finance',
  'financeBreakdown',
  'attendance',
  'attendanceBreakdown',
  'tasks',
  'comparison',
] as const;
export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number];

export class DashboardWidgetDto {
  @IsIn(DASHBOARD_WIDGETS)
  @ApiProperty({ enum: DASHBOARD_WIDGETS })
  key!: DashboardWidgetKey;

  @IsBoolean()
  visible!: boolean;

  @IsOptional()
  @IsIn(['bar', 'line'])
  @ApiProperty({ enum: ['bar', 'line'], required: false })
  chart?: 'bar' | 'line';
}

/** Saved filter values (same names as the analytics query). */
export class DashboardSavedFiltersDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'quarter', 'year', 'custom', 'date'])
  period?: string;
  @IsOptional() @IsDateOnly() from?: string;
  @IsOptional() @IsDateOnly() to?: string;
  @IsOptional() @IsDateOnly() date?: string;
  @IsOptional() @IsUUID() subCenterId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsUUID() levelId?: string;
  @IsOptional() @IsUUID() teacherId?: string;
  @IsOptional() @IsUUID() cashierId?: string;
}

export class DashboardLayoutDto {
  /** In display order; unknown or missing widgets fall back to the default. */
  @IsArray()
  @ArrayMaxSize(DASHBOARD_WIDGETS.length)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets!: DashboardWidgetDto[];

  @ValidateNested()
  @Type(() => DashboardSavedFiltersDto)
  filters!: DashboardSavedFiltersDto;
}

export class DashboardLayoutResponseDto extends DashboardLayoutDto {
  /** false = the default layout (nothing saved yet). */
  customized!: boolean;
}
