import { ApiProperty } from '@nestjs/swagger';
import { ReportPeriodDto, ReportQueryDto } from '../reports/common/report-query.dto';

export class DashboardQueryDto extends ReportQueryDto {}

class StudentsSectionDto {
  total!: number;
  active!: number;
  frozen!: number;
  graduated!: number;
  left!: number;
  newStudents!: number;
}

class FamiliesSectionDto {
  total!: number;
  active!: number;
}

/** Active groups; `enrolled` = active enrollments in them. Free seats = capacity − enrolled. */
class GroupsSectionDto {
  active!: number;
  capacity!: number;
  enrolled!: number;
}

class AttendanceTodayDto {
  totalMarks!: number;
  present!: number;
  absent!: number;
  late!: number;
  excused!: number;
  attendanceRate!: number;
}

class AttendanceSectionDto {
  today!: AttendanceTodayDto;
  /** Rate over the selected period. */
  attendanceRate!: number;
}

/** Money fields are decimal strings. */
class FinanceSectionDto {
  todayPayments!: string;
  /** Payments − refunds in the period. */
  revenue!: string;
  expenses!: string;
  outstandingDebt!: string;
  overdueDebt!: string;
  /** Unpaid invoices past their due date (now). */
  overdueInvoices!: number;
}

class LeadsSectionDto {
  newLeads!: number;
  converted!: number;
  conversionRate!: number;
  /** Leads currently in the trial-booked stage. */
  trialBooked!: number;
  /** Open leads whose follow-up is due today or overdue (now). */
  followUpsDue!: number;
}

/** Current workload; `completed` counts tasks finished within the period. */
class TasksSectionDto {
  open!: number;
  overdue!: number;
  dueToday!: number;
  completed!: number;
}

class TeachersSectionDto {
  active!: number;
}

class NotificationsSectionDto {
  unread!: number;
}

/**
 * A section is `null` when the caller lacks its domain permission
 * (students.read, families.read, groups.read, teachers.read, attendance.read,
 * finance.report.read, leads.report.read, tasks.statistics.read, notifications.read).
 */
export class DashboardOverviewDto {
  @ApiProperty({ type: ReportPeriodDto })
  period!: ReportPeriodDto;
  students!: StudentsSectionDto | null;
  families!: FamiliesSectionDto | null;
  groups!: GroupsSectionDto | null;
  teachers!: TeachersSectionDto | null;
  attendance!: AttendanceSectionDto | null;
  finance!: FinanceSectionDto | null;
  leads!: LeadsSectionDto | null;
  tasks!: TasksSectionDto | null;
  /** Tasks assigned to the caller (tasks.read or tasks.read_own). */
  myTasks!: TasksSectionDto | null;
  notifications!: NotificationsSectionDto | null;
}
