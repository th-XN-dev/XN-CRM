import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { PaginationMetaDto } from '../../common/swagger/common-responses.dto';
import { ReportPeriodDto } from './report-query.dto';

/** Money fields are decimal strings, e.g. "450000" or "1250.50". */
class MethodTotalDto {
  amount!: string;
  count!: number;
}

class ByMethodDto {
  CASH!: MethodTotalDto;
  CARD!: MethodTotalDto;
  BANK_TRANSFER!: MethodTotalDto;
  ONLINE!: MethodTotalDto;
  OTHER!: MethodTotalDto;
}

export class FinanceSummaryReportDto {
  period!: ReportPeriodDto;
  totalInvoiced!: string;
  invoiceCount!: number;
  totalPaid!: string;
  paymentCount!: number;
  totalRefunded!: string;
  netPaid!: string;
  totalExpenses!: string;
  netRevenue!: string;
  /** Outstanding now, not limited to the period. */
  totalDebt!: string;
  overdueDebt!: string;
  byMethod!: ByMethodDto;
}

class RevenuePointDto {
  /** Day or first day of the month. */
  bucket!: string;
  income!: string;
  payments!: number;
  refunds!: string;
  net!: string;
}

export class RevenueReportDto {
  period!: ReportPeriodDto;
  granularity!: 'day' | 'month';
  totalIncome!: string;
  totalRefunds!: string;
  @ApiProperty({ type: [RevenuePointDto] })
  series!: RevenuePointDto[];
}

class CategoryTotalDto {
  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;
  amount!: string;
  count!: number;
}

class AmountPointDto {
  bucket!: string;
  amount!: string;
  count!: number;
}

export class ExpensesReportDto {
  period!: ReportPeriodDto;
  granularity!: 'day' | 'month';
  totalExpenses!: string;
  @ApiProperty({ type: [CategoryTotalDto] })
  byCategory!: CategoryTotalDto[];
  @ApiProperty({ type: [AmountPointDto] })
  series!: AmountPointDto[];
}

class AgingBucketDto {
  @ApiProperty({ enum: ['current', '1-30', '31-60', '61-90', '90+'] })
  bucket!: string;
  invoices!: number;
  amount!: string;
}

class DebtorDto {
  familyId!: string;
  familyName!: string;
  invoices!: number;
  amount!: string;
  oldestDueDate!: Date;
}

class DebtorPageDto {
  @ApiProperty({ type: [DebtorDto] })
  items!: DebtorDto[];
  meta!: PaginationMetaDto;
}

export class DebtReportDto {
  asOf!: string;
  totalDebt!: string;
  overdueDebt!: string;
  @ApiProperty({ type: [AgingBucketDto] })
  aging!: AgingBucketDto[];
  topDebtors!: DebtorPageDto;
}

class CashierTotalDto {
  cashierId!: string;
  name!: string | null;
  amount!: string;
  count!: number;
}

export class PaymentsReportDto {
  period!: ReportPeriodDto;
  totalPaid!: string;
  paymentCount!: number;
  byMethod!: ByMethodDto;
  @ApiProperty({ type: [CashierTotalDto] })
  byCashier!: CashierTotalDto[];
}

export class StudentSummaryReportDto {
  period!: ReportPeriodDto;
  totalStudents!: number;
  active!: number;
  frozen!: number;
  graduated!: number;
  left!: number;
  newStudents!: number;
  leftStudents!: number;
  growth!: number;
}

class GrowthPointDto {
  bucket!: string;
  joined!: number;
  left!: number;
  net!: number;
}

export class StudentGrowthReportDto {
  period!: ReportPeriodDto;
  granularity!: 'day' | 'month';
  joined!: number;
  left!: number;
  @ApiProperty({ type: [GrowthPointDto] })
  series!: GrowthPointDto[];
}

export class StudentStatusReportDto {
  period!: ReportPeriodDto;
  /** { ACTIVE, FROZEN, GRADUATED, LEFT } */
  byStatus!: Record<string, number>;
  /** Per branch: { branchId, name, ACTIVE, FROZEN, GRADUATED, LEFT } */
  byBranch!: Record<string, unknown>[];
}

export class AttendanceSummaryReportDto {
  period!: ReportPeriodDto;
  /** Group-days with at least one mark. */
  totalLessons!: number;
  totalMarks!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  /** (PRESENT + LATE) / totalMarks × 100 */
  attendanceRate!: number;
}

class AttendanceRowDto {
  /** Group or student id. */
  id!: string;
  name!: string;
  total!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  lessons!: number;
  attendanceRate!: number;
}

export class AttendanceRankingReportDto {
  period!: ReportPeriodDto;
  @ApiProperty({ type: [AttendanceRowDto] })
  items!: AttendanceRowDto[];
  meta!: PaginationMetaDto;
}

export class LeadSummaryReportDto {
  period!: ReportPeriodDto;
  totalLeads!: number;
  new!: number;
  contacted!: number;
  qualified!: number;
  trialBooked!: number;
  trialAttended!: number;
  trial!: number;
  negotiation!: number;
  converted!: number;
  lost!: number;
  conversionRate!: number;
  trialAttendanceRate!: number;
}

class SourceLineDto {
  sourceId!: string | null;
  name!: string | null;
  code!: string | null;
  total!: number;
  open!: number;
  converted!: number;
  lost!: number;
  conversionRate!: number;
}

export class LeadSourcesReportDto {
  period!: ReportPeriodDto;
  totalLeads!: number;
  @ApiProperty({ type: [SourceLineDto] })
  bySource!: SourceLineDto[];
}

class StageLineDto {
  stageId!: string;
  name!: string;
  code!: string;
  order!: number;
  count!: number;
}

class PipelineRefDto {
  id!: string;
  name!: string;
}

export class LeadPipelineReportDto {
  period!: ReportPeriodDto;
  pipeline!: PipelineRefDto;
  @ApiProperty({ type: [StageLineDto] })
  stages!: StageLineDto[];
  /** Count per lead status. */
  byStatus!: Record<string, number>;
}

export class TaskSummaryReportDto {
  period!: ReportPeriodDto;
  total!: number;
  todo!: number;
  inProgress!: number;
  blocked!: number;
  completed!: number;
  cancelled!: number;
  overdue!: number;
}

class EmployeeTasksRowDto {
  employeeId!: string;
  firstName!: string;
  lastName!: string;
  assigned!: number;
  completed!: number;
  cancelled!: number;
  overdue!: number;
  completionRate!: number;
}

export class TaskEmployeesReportDto {
  period!: ReportPeriodDto;
  @ApiProperty({ type: [EmployeeTasksRowDto] })
  items!: EmployeeTasksRowDto[];
  meta!: PaginationMetaDto;
}
