import { Injectable } from '@nestjs/common';
import { type Prisma, TaskActivityType } from '@prisma/client';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateTaskCommentDto, type ListTaskHistoryQueryDto } from './dto/task.dto';
import { TaskAccessService } from './task-access.service';
import { TaskHistoryService } from './task-history.service';

const COMMENT_SELECT = {
  id: true,
  taskId: true,
  userId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.TaskCommentSelect;

/** Anyone who can see a task (and has `tasks.comment`) can discuss it; closed tasks included. */
@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
    private readonly access: TaskAccessService,
    private readonly history: TaskHistoryService,
  ) {}

  async add(tenant: TenantContext, taskId: string, dto: CreateTaskCommentDto) {
    await this.access.getVisible(tenant, taskId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: {
          organizationId: tenant.organizationId,
          taskId,
          userId: tenant.userId,
          content: dto.content,
        },
        select: COMMENT_SELECT,
      });
      await this.history.record(tx, tenant, taskId, TaskActivityType.COMMENTED, {
        newValue: created.id,
      });
      return created;
    });
    this.events.publish(tenant, {
      name: DomainEventName.TASK_COMMENTED,
      entityType: 'TaskComment',
      entityId: comment.id,
      payload: { taskId },
    });
    return comment;
  }

  /** Oldest first, like a conversation. */
  async list(tenant: TenantContext, taskId: string, query: ListTaskHistoryQueryDto) {
    await this.access.getVisible(tenant, taskId);
    const where = { taskId, organizationId: tenant.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskComment.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...pageArgs(query),
        select: COMMENT_SELECT,
      }),
      this.prisma.taskComment.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }
}
