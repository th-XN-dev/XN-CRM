import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Paginated } from '../../common/pagination/paginated';
import { PrismaService } from '../../database/prisma.service';
import { completionRate } from '../../tasks/task-rules';
import { TaskStatsService } from '../../tasks/task-stats.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { resolvePeriod } from '../common/report-period';
import { periodInfo, sqlBranchFilter } from '../common/report-scope';
import { type TaskEmployeesReportQueryDto, type TaskReportQueryDto } from './crm-report.dto';

/** Task reports over tasks created in the period (factual counts, not ratings). */
@Injectable()
export class TaskReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: TaskStatsService,
  ) {}

  /** Status counts and overdue (shared with GET /tasks/statistics). */
  async summary(tenant: TenantContext, query: TaskReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const counts = await this.stats.statistics(tenant, {
      branchId: query.branchId,
      assignedToId: query.employeeId,
      from: period.from,
      to: period.to,
    });
    return { period: periodInfo(period), ...counts };
  }

  /** Per assignee: assigned, completed, cancelled, overdue and completion rate. */
  async employees(tenant: TenantContext, query: TaskEmployeesReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const now = new Date();
    const rows = await this.prisma.$queryRaw<
      {
        employeeId: string;
        firstName: string;
        lastName: string;
        assigned: number;
        completed: number;
        cancelled: number;
        overdue: number;
        rows: number;
      }[]
    >`
      SELECT e.id AS "employeeId", e.first_name AS "firstName", e.last_name AS "lastName",
             COUNT(*)::int AS assigned,
             (COUNT(*) FILTER (WHERE t.status = 'COMPLETED'))::int AS completed,
             (COUNT(*) FILTER (WHERE t.status = 'CANCELLED'))::int AS cancelled,
             (COUNT(*) FILTER (
               WHERE t.due_date < ${now} AND t.status NOT IN ('COMPLETED', 'CANCELLED')
             ))::int AS overdue,
             COUNT(*) OVER ()::int AS rows
      FROM tasks t JOIN employees e ON e.id = t.assigned_to_id
      WHERE t.organization_id = ${tenant.organizationId}::uuid
        AND t.deleted_at IS NULL
        AND t.created_at >= ${period.start} AND t.created_at < ${period.end}
        ${sqlBranchFilter(tenant, Prisma.sql`t.branch_id`, query.branchId)}
      GROUP BY e.id, e.first_name, e.last_name
      ORDER BY assigned DESC, e.last_name, e.id
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`;
    const items = rows.map(({ rows: _rows, ...row }) => ({
      ...row,
      completionRate: completionRate(row.completed, row.cancelled),
    }));
    return { period: periodInfo(period), ...new Paginated(items, rows[0]?.rows ?? 0, query) };
  }
}
