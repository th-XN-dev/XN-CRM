import { IsOptional, IsUUID } from 'class-validator';

/** One of `familyId` / `studentId` is required. */
export class FinanceSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  familyId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
