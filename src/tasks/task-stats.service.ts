import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { dayRangeFilter } from '../common/utils/date-range';
import { PrismaService } from '../database/prisma.service';
import { EmployeesService } from '../hr/employees/employees.service';
import { branchListFilter } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type TaskStatisticsQueryDto } from './dto/task.dto';
import { completionRate, overdueWhere, type TaskCounts, tallyTasks } from './task-rules';

/** Factual task counts — not a performance rating. */
@Injectable()
export class TaskStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  /** Organization/branch totals by status, plus overdue. */
  statistics(tenant: TenantContext, query: TaskStatisticsQueryDto): Promise<TaskCounts> {
    return this.count({
      organizationId: tenant.organizationId,
      deletedAt: null,
      branchId: branchListFilter(tenant, query.branchId),
      assignedToId: query.assignedToId,
      createdAt: dayRangeFilter(query, tenant.timezone),
    });
  }

  /** One employee's assigned tasks (all branches) and their completion rate. */
  async employeeStatistics(tenant: TenantContext, employeeId: string) {
    await this.employees.getAccessible(tenant, employeeId);
    const counts = await this.count({
      organizationId: tenant.organizationId,
      deletedAt: null,
      assignedToId: employeeId,
    });
    return {
      employeeId,
      ...counts,
      completionRate: completionRate(counts.completed, counts.cancelled),
    };
  }

  private async count(where: Prisma.TaskWhereInput): Promise<TaskCounts> {
    const [rows, overdue] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.task.count({ where: { AND: [where, overdueWhere(true, new Date())] } }),
    ]);
    return tallyTasks(rows, overdue);
  }
}
