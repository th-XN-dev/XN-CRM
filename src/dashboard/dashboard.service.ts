import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  GroupStatus,
  InvoiceStatus,
  type Prisma,
  TaskStatus,
  TeacherStatus,
} from '@prisma/client';
import { localDayBounds, todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { leadAccessWhere } from '../leads/lead.access';
import { TERMINAL_LEAD_STATUSES } from '../leads/lead-status';
import { NotificationInboxService } from '../notifications/notification-inbox.service';
import { PERMISSIONS, type PermissionKey } from '../permissions/permissions.catalog';
import { AttendanceReportsService } from '../reports/academic/attendance-reports.service';
import { StudentReportsService } from '../reports/academic/student-reports.service';
import { resolvePeriod } from '../reports/common/report-period';
import { periodInfo } from '../reports/common/report-scope';
import { LeadReportsService } from '../reports/crm/lead-reports.service';
import { FinanceReportsService } from '../reports/finance/finance-reports.service';
import { TaskStatsService } from '../tasks/task-stats.service';
import { CLOSED_TASK_STATUSES } from '../tasks/task-rules';
import { branchListFilter, scopedBranchWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type DashboardQueryDto } from './dashboard.dto';

/**
 * One call for the home screen. It composes the report services (no metric is
 * computed twice) and only fills the sections the caller may see.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentReportsService,
    private readonly attendance: AttendanceReportsService,
    private readonly finance: FinanceReportsService,
    private readonly leads: LeadReportsService,
    private readonly tasks: TaskStatsService,
    private readonly inbox: NotificationInboxService,
  ) {}

  async overview(tenant: TenantContext, query: DashboardQueryDto) {
    const period = resolvePeriod(query, tenant.timezone); // validates the period up front
    const today = { period: 'today' as const, branchId: query.branchId };
    const scope = scopedBranchWhere(tenant, query.branchId);
    const when = <T>(permission: PermissionKey, load: () => Promise<T>): Promise<T | null> =>
      tenant.permissions.has(permission) ? load() : Promise.resolve(null);

    const day = localDayBounds(tenant.timezone);
    const [
      students,
      families,
      groups,
      teachers,
      attendance,
      finance,
      leads,
      tasks,
      myTasks,
      notifications,
    ] = await Promise.all([
      when(PERMISSIONS.STUDENTS_READ, async () => {
        const s = await this.students.summary(tenant, query);
        return {
          total: s.totalStudents,
          active: s.active,
          frozen: s.frozen,
          graduated: s.graduated,
          left: s.left,
          newStudents: s.newStudents,
        };
      }),
      when(PERMISSIONS.FAMILIES_READ, async () => {
        const branch = branchListFilter(tenant, query.branchId);
        const where: Prisma.FamilyWhereInput = {
          organizationId: tenant.organizationId,
          ...(branch !== undefined && { primaryBranchId: branch }),
        };
        const [total, active] = await Promise.all([
          this.prisma.family.count({ where }),
          this.prisma.family.count({ where: { ...where, isActive: true } }),
        ]);
        return { total, active };
      }),
      when(PERMISSIONS.GROUPS_READ, async () => {
        const [running, enrolled] = await Promise.all([
          this.prisma.group.aggregate({
            where: { ...scope, status: GroupStatus.ACTIVE },
            _count: { _all: true },
            _sum: { capacity: true },
          }),
          this.prisma.enrollment.count({
            where: {
              ...scope,
              status: EnrollmentStatus.ACTIVE,
              group: { status: GroupStatus.ACTIVE },
            },
          }),
        ]);
        return {
          active: running._count._all,
          capacity: running._sum.capacity ?? 0,
          enrolled,
        };
      }),
      when(PERMISSIONS.TEACHERS_READ, async () => ({
        active: await this.prisma.teacher.count({
          where: { ...scope, status: TeacherStatus.ACTIVE },
        }),
      })),
      when(PERMISSIONS.ATTENDANCE_READ, async () => {
        const [todays, inPeriod] = await Promise.all([
          this.attendance.summary(tenant, today),
          this.attendance.summary(tenant, query),
        ]);
        const { period: _p, totalLessons: _l, ...todayCounts } = todays;
        return { today: todayCounts, attendanceRate: inPeriod.attendanceRate };
      }),
      when(PERMISSIONS.FINANCE_REPORT_READ, async () => {
        const [todays, inPeriod, overdueInvoices] = await Promise.all([
          this.finance.payments(tenant, today),
          this.finance.summary(tenant, query),
          this.prisma.invoice.count({
            where: {
              ...scope,
              status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
              dueDate: { lt: todayIn(tenant.timezone) },
            },
          }),
        ]);
        return {
          todayPayments: todays.totalPaid,
          revenue: inPeriod.netPaid,
          expenses: inPeriod.totalExpenses,
          outstandingDebt: inPeriod.totalDebt,
          overdueDebt: inPeriod.overdueDebt,
          overdueInvoices,
        };
      }),
      when(PERMISSIONS.LEADS_REPORT_READ, async () => {
        const [l, followUpsDue] = await Promise.all([
          this.leads.summary(tenant, query),
          this.prisma.lead.count({
            where: {
              AND: [
                leadAccessWhere(tenant),
                {
                  branchId: branchListFilter(tenant, query.branchId),
                  status: { notIn: TERMINAL_LEAD_STATUSES },
                  nextFollowUpAt: { lt: day.end },
                },
              ],
            },
          }),
        ]);
        return {
          newLeads: l.totalLeads,
          converted: l.converted,
          conversionRate: l.conversionRate,
          trialBooked: l.trialBooked,
          followUpsDue,
        };
      }),
      when(PERMISSIONS.TASKS_STATISTICS_READ, async () => {
        // Current workload, not limited to the period.
        const t = await this.tasks.statistics(tenant, { branchId: query.branchId });
        const extra = await this.taskExtras(
          { ...scope, deletedAt: null },
          day,
          period.start,
          period.end,
        );
        return { open: t.todo + t.inProgress + t.blocked, overdue: t.overdue, ...extra };
      }),
      tenant.permissions.has(PERMISSIONS.TASKS_READ) ||
      tenant.permissions.has(PERMISSIONS.TASKS_READ_OWN)
        ? this.myTasks(tenant, query.branchId, day, period.start, period.end)
        : Promise.resolve(null),
      when(PERMISSIONS.NOTIFICATIONS_READ, async () => ({
        unread: (await this.inbox.unreadCount(tenant)).count,
      })),
    ]);

    return {
      period: periodInfo(period),
      students,
      families,
      groups,
      teachers,
      attendance,
      finance,
      leads,
      tasks,
      myTasks,
      notifications,
    };
  }

  /** Open / overdue / due today / completed in the period for the caller's own tasks. */
  private async myTasks(
    tenant: TenantContext,
    branchId: string | undefined,
    day: { start: Date; end: Date },
    from: Date,
    to: Date,
  ) {
    const where: Prisma.TaskWhereInput = {
      organizationId: tenant.organizationId,
      deletedAt: null,
      branchId: branchListFilter(tenant, branchId),
      assignedTo: { userId: tenant.userId },
    };
    const [open, overdue, extra] = await Promise.all([
      this.prisma.task.count({ where: { ...where, status: { notIn: CLOSED_TASK_STATUSES } } }),
      this.prisma.task.count({
        where: { ...where, status: { notIn: CLOSED_TASK_STATUSES }, dueDate: { lt: new Date() } },
      }),
      this.taskExtras(where, day, from, to),
    ]);
    return { open, overdue, ...extra };
  }

  private async taskExtras(
    where: Prisma.TaskWhereInput,
    day: { start: Date; end: Date },
    from: Date,
    to: Date,
  ) {
    const [dueToday, completed] = await Promise.all([
      this.prisma.task.count({
        where: {
          ...where,
          status: { notIn: CLOSED_TASK_STATUSES },
          dueDate: { gte: day.start, lt: day.end },
        },
      }),
      this.prisma.task.count({
        where: { ...where, status: TaskStatus.COMPLETED, completedAt: { gte: from, lt: to } },
      }),
    ]);
    return { dueToday, completed };
  }
}
