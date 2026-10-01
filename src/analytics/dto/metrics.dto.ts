import { ApiProperty } from '@nestjs/swagger';
import { ReportPeriodDto } from '../../reports/common/report-query.dto';

/** Comparable numbers of one unit (center, sub-center, branch). Money is a decimal string. */
export class UnitMetricsDto {
  activeStudents!: number;
  newStudents!: number;
  previousNewStudents!: number;
  /** % change of new students vs the previous period of the same length; null = no base. */
  growthRate!: number | null;
  activeFamilies!: number;
  activeGroups!: number;
  attendanceMarks!: number;
  attendedMarks!: number;
  attendanceRate!: number;
  /** Payments − refunds in the period. */
  revenue!: string;
  /** Outstanding now. */
  debt!: string;
  newLeads!: number;
  convertedLeads!: number;
  conversionRate!: number;
  openTasks!: number;
  overdueTasks!: number;
}

const AVAILABILITIES = ['ACTIVE', 'FROZEN', 'ARCHIVED', 'EXPIRED', 'NOT_STARTED'];

class CenterLifecycleCountsDto {
  total!: number;
  active!: number;
  frozen!: number;
  outOfPeriod!: number;
  archived!: number;
}

class CenterAnalyticsRowDto {
  id!: string;
  name!: string;
  slug!: string;
  primaryColor!: string;
  @ApiProperty({ enum: ['ACTIVE', 'FROZEN', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'FROZEN' | 'ARCHIVED';
  @ApiProperty({ enum: AVAILABILITIES })
  availability!: string;
  activeFrom!: Date | null;
  activeUntil!: Date | null;
  currency!: string;
  metrics!: UnitMetricsDto;
}

export class OwnerAnalyticsDto {
  period!: ReportPeriodDto;
  centers!: CenterLifecycleCountsDto;
  /** Users who can work in at least one non-archived center. */
  users!: number;
  totals!: UnitMetricsDto;
  currencies!: string[];
  rows!: CenterAnalyticsRowDto[];
}

class AnalyticsUnitRefDto {
  /** null = branches directly under the center. */
  id!: string | null;
  name!: string | null;
  code!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'FROZEN', 'ARCHIVED'], nullable: true })
  status!: 'ACTIVE' | 'FROZEN' | 'ARCHIVED' | null;
}

class BranchAnalyticsRowDto {
  id!: string;
  name!: string;
  code!: string;
  isActive!: boolean;
  subCenterId!: string | null;
  metrics!: UnitMetricsDto;
}

class SubCenterAnalyticsRowDto extends AnalyticsUnitRefDto {
  branchCount!: number;
  metrics!: UnitMetricsDto;
}

class CenterRefDto {
  id!: string;
  name!: string;
  currency!: string;
}

export class CenterAnalyticsDto {
  period!: ReportPeriodDto;
  center!: CenterRefDto;
  totals!: UnitMetricsDto;
  subCenters!: SubCenterAnalyticsRowDto[];
  branches!: BranchAnalyticsRowDto[];
}
