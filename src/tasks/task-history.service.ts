import { Injectable } from '@nestjs/common';
import { type Prisma, type TaskActivityType } from '@prisma/client';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { type ListTaskHistoryQueryDto } from './dto/task.dto';
import { TaskAccessService } from './task-access.service';

const ACTIVITY_SELECT = {
  id: true,
  taskId: true,
  userId: true,
  type: true,
  oldValue: true,
  newValue: true,
  note: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.TaskActivitySelect;

export interface TaskChange {
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}

/** Append-only task history: rows are only ever inserted, never updated or deleted. */
@Injectable()
export class TaskHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  /** Writes one history row; call inside the transaction of the change it records. */
  record(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    taskId: string,
    type: TaskActivityType,
    change: TaskChange = {},
  ) {
    return tx.taskActivity.create({
      data: {
        organizationId: tenant.organizationId,
        taskId,
        userId: tenant.userId,
        type,
        oldValue: change.oldValue ?? null,
        newValue: change.newValue ?? null,
        note: change.note ?? null,
      },
      select: { id: true },
    });
  }

  async list(tenant: TenantContext, taskId: string, query: ListTaskHistoryQueryDto) {
    await this.access.getVisible(tenant, taskId);
    const where = { taskId, organizationId: tenant.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskActivity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: ACTIVITY_SELECT,
      }),
      this.prisma.taskActivity.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }
}
