import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class LeadStatsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Count leads created on or after this date/time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Count leads created on or before this date/time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class LeadStatsResponseDto {
  totalLeads!: number;
  new!: number;
  contacted!: number;
  qualified!: number;
  trialBooked!: number;
  trialAttended!: number;
  negotiation!: number;
  converted!: number;
  lost!: number;
  /** converted / qualified × 100, rounded to 2 decimals. */
  conversionRate!: number;
  /** trialAttended / trialBooked × 100, rounded to 2 decimals. */
  trialAttendanceRate!: number;
  bySource!: { sourceId: string | null; name: string | null; code: string | null; count: number }[];
}
