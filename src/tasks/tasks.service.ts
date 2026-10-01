import { Injectable } from '@nestjs/common';
import { type Prisma, TaskActivityType, TaskStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../common/pagination/search';
import { randomUUID } from 'node:crypto';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { EmployeesService } from '../hr/employees/employees.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type AssignTaskDto,
  type ChangeTaskStatusDto,
  type CreateTaskBatchDto,
  type CreateTaskDto,
  type ListTasksQueryDto,
  type UpdateTaskDto,
} from './dto/task.dto';
import {
  accessDenied,
  isAssignedTo,
  TASK_SELECT,
  TaskAccessService,
  type TaskRecord,
} from './task-access.service';
import { TaskHistoryService } from './task-history.service';
import { TaskRelationsService } from './task-relations.service';
import { canChangeTaskStatus, isClosed, isOverdue, needsReason, overdueWhere } from './task-rules';

type Tx = Prisma.TransactionClient;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
    private readonly access: TaskAccessService,
    private readonly history: TaskHistoryService,
    private readonly relations: TaskRelationsService,
    private readonly employees: EmployeesService,
  ) {}

  async create(tenant: TenantContext, dto: CreateTaskDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    if (dto.assignedToId && !tenant.permissions.has(PERMISSIONS.TASKS_ASSIGN)) {
      throw AppException.forbidden(
        ErrorCode.PERMISSION_DENIED,
        `Missing permission: ${PERMISSIONS.TASKS_ASSIGN}`,
      );
    }
    if (dto.relatedType && dto.relatedId) {
      await this.relations.assertExists(tenant, dto.relatedType, dto.relatedId);
    }

    const task = await this.prisma.$transaction(async (tx) => {
      if (dto.assignedToId) {
        await this.employees.assertAssignable(tx, tenant, dto.assignedToId, branchId);
      }
      const created = await tx.task.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          assignedToId: dto.assignedToId,
          relatedType: dto.relatedType,
          relatedId: dto.relatedId,
          createdById: tenant.userId,
        },
        select: TASK_SELECT,
      });
      await this.history.record(tx, tenant, created.id, TaskActivityType.CREATED, {
        newValue: created.title,
      });
      if (created.assignedToId) {
        await this.history.record(tx, tenant, created.id, TaskActivityType.ASSIGNED, {
          newValue: created.assignedToId,
        });
      }
      return created;
    });

    this.events.publish(tenant, {
      name: DomainEventName.TASK_CREATED,
      entityType: 'Task',
      entityId: task.id,
      payload: { branchId, assignedToId: task.assignedToId, priority: task.priority },
    });
    return present(task);
  }

  /**
   * The same task for several employees, or every active employee of the
   * branch: one copy each (own status and comments), sharing a `batchId`.
   * All copies are created in one transaction — all or nothing.
   */
  async createBatch(tenant: TenantContext, dto: CreateTaskBatchDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    if (dto.relatedType && dto.relatedId) {
      await this.relations.assertExists(tenant, dto.relatedType, dto.relatedId);
    }
    const ids = dto.allEmployees
      ? (
          await this.prisma.employee.findMany({
            where: {
              organizationId: tenant.organizationId,
              status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE] },
              branches: { some: { branchId } },
            },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [...new Set(dto.assigneeIds ?? [])];
    if (ids.length === 0) {
      throw AppException.badRequest(
        ErrorCode.TASK_NO_ASSIGNEES,
        'Choose at least one employee (or allEmployees)',
      );
    }
    const batchId = randomUUID();
    const tasks = await this.prisma.$transaction(
      async (tx) => {
        const created: TaskRecord[] = [];
        for (const assigneeId of ids) {
          await this.employees.assertAssignable(tx, tenant, assigneeId, branchId);
          const task = await tx.task.create({
            data: {
              organizationId: tenant.organizationId,
              branchId,
              title: dto.title,
              description: dto.description,
              priority: dto.priority,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
              assignedToId: assigneeId,
              relatedType: dto.relatedType,
              relatedId: dto.relatedId,
              batchId,
              createdById: tenant.userId,
            },
            select: TASK_SELECT,
          });
          await this.history.record(tx, tenant, task.id, TaskActivityType.CREATED, {
            newValue: task.title,
          });
          await this.history.record(tx, tenant, task.id, TaskActivityType.ASSIGNED, {
            newValue: assigneeId,
          });
          created.push(task);
        }
        return created;
      },
      { timeout: 60_000 },
    );
    for (const task of tasks) {
      this.events.publish(tenant, {
        name: DomainEventName.TASK_CREATED,
        entityType: 'Task',
        entityId: task.id,
        payload: { branchId, assignedToId: task.assignedToId, priority: task.priority, batchId },
      });
    }
    return { batchId, count: tasks.length, tasks: tasks.map((task) => present(task)) };
  }

  async list(tenant: TenantContext, query: ListTasksQueryDto) {
    if (query.dueFrom && query.dueTo && new Date(query.dueFrom) > new Date(query.dueTo)) {
      throw AppException.badRequest(
        ErrorCode.INVALID_DATE_RANGE,
        '`dueFrom` must not be after `dueTo`',
      );
    }
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      AND: [
        // Security boundary: organization, branches and own-only visibility.
        this.access.visibleWhere(tenant),
        {
          branchId: query.branchId ?? tenant.branchId ?? undefined,
          assignedToId: query.assignedToId,
          createdById: query.createdById,
          status: query.status,
          priority: query.priority,
          relatedType: query.relatedType,
          relatedId: query.relatedId,
          ...((query.dueFrom || query.dueTo) && {
            dueDate: {
              gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
              lte: query.dueTo ? new Date(query.dueTo) : undefined,
            },
          }),
        },
        query.mine ? { assignedTo: { userId: tenant.userId } } : {},
        overdueWhere(query.overdue, now),
        searchWhere<Prisma.TaskWhereInput>(query.search, (term) => [
          { title: icontains(term) },
          { description: icontains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: TASK_SELECT,
      }),
      this.prisma.task.count({ where }),
    ]);
    return new Paginated(
      items.map((item) => present(item, now)),
      total,
      query,
    );
  }

  /** `GET /tasks/overdue`: the overdue subset, most overdue first by default. */
  listOverdue(tenant: TenantContext, query: ListTasksQueryDto) {
    return this.list(tenant, { ...query, overdue: true });
  }

  async findOne(tenant: TenantContext, id: string) {
    return present(await this.access.getVisible(tenant, id));
  }

  async update(tenant: TenantContext, id: string, dto: UpdateTaskDto) {
    const current = await this.access.getManageable(tenant, id);
    assertOpen(current);
    // Only fields actually sent (DTO class fields exist as `undefined` otherwise).
    const changed = (Object.keys(dto) as (keyof UpdateTaskDto)[]).filter(
      (key) => dto[key] !== undefined,
    );

    const relatedType = dto.relatedType === undefined ? current.relatedType : dto.relatedType;
    const relatedId = dto.relatedId === undefined ? current.relatedId : dto.relatedId;
    if ((relatedType === null) !== (relatedId === null)) {
      throw AppException.badRequest(
        ErrorCode.BAD_REQUEST,
        'relatedType and relatedId must be set or cleared together',
      );
    }
    const relationChanged = relatedType !== current.relatedType || relatedId !== current.relatedId;
    if (relationChanged && relatedType && relatedId) {
      await this.relations.assertExists(tenant, relatedType, relatedId);
    }
    const dueDate =
      dto.dueDate === undefined ? undefined : dto.dueDate === null ? null : new Date(dto.dueDate);

    const task = await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockFresh(tx, tenant, id);
      assertOpen(fresh);
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          dueDate,
          relatedType,
          relatedId,
        },
        select: TASK_SELECT,
      });

      if (dto.priority && dto.priority !== fresh.priority) {
        await this.history.record(tx, tenant, id, TaskActivityType.PRIORITY_CHANGED, {
          oldValue: fresh.priority,
          newValue: updated.priority,
        });
      }
      if (dueDate !== undefined && dueDate?.getTime() !== fresh.dueDate?.getTime()) {
        await this.history.record(tx, tenant, id, TaskActivityType.DEADLINE_CHANGED, {
          oldValue: fresh.dueDate?.toISOString() ?? null,
          newValue: updated.dueDate?.toISOString() ?? null,
        });
      }
      const otherFields = changed.filter((key) => key !== 'priority' && key !== 'dueDate');
      if (otherFields.length > 0) {
        await this.history.record(tx, tenant, id, TaskActivityType.UPDATED, {
          newValue: otherFields.join(','),
        });
      }
      return updated;
    });

    this.events.publish(tenant, {
      name: DomainEventName.TASK_UPDATED,
      entityType: 'Task',
      entityId: id,
      payload: { fields: changed },
    });
    return present(task);
  }

  /**
   * Managers (`tasks.update`) may make any allowed transition in their branches.
   * With only `tasks.update_own`, the assignee may move an open task along
   * (TODO / IN_PROGRESS / BLOCKED / COMPLETED) but not cancel or reopen it.
   */
  async changeStatus(tenant: TenantContext, id: string, dto: ChangeTaskStatusDto) {
    const isManager = tenant.permissions.has(PERMISSIONS.TASKS_UPDATE);
    const current = isManager
      ? await this.access.getManageable(tenant, id)
      : await this.access.getVisible(tenant, id);
    if (!isManager) assertAssigneeMove(tenant, current, dto.status);

    const task = await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockFresh(tx, tenant, id);
      if (!isManager) assertAssigneeMove(tenant, fresh, dto.status);
      if (!canChangeTaskStatus(fresh.status, dto.status)) {
        throw AppException.badRequest(
          ErrorCode.INVALID_STATUS_TRANSITION,
          `Cannot change task status from ${fresh.status} to ${dto.status}`,
        );
      }
      // Not done → say why (it is kept in the task's history).
      if (needsReason(dto.status) && !dto.note?.trim()) {
        throw AppException.badRequest(
          ErrorCode.TASK_REASON_REQUIRED,
          'Write why the task is waiting or cancelled (note)',
        );
      }
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: dto.status,
          completedAt: dto.status === TaskStatus.COMPLETED ? new Date() : null,
        },
        select: TASK_SELECT,
      });
      await this.history.record(tx, tenant, id, statusActivity(dto.status), {
        oldValue: fresh.status,
        newValue: dto.status,
        note: dto.note,
      });
      return { updated, from: fresh.status };
    });

    this.events.publish(tenant, {
      name: DomainEventName.TASK_STATUS_CHANGED,
      entityType: 'Task',
      entityId: id,
      payload: { from: task.from, to: dto.status },
    });
    return present(task.updated);
  }

  async assign(tenant: TenantContext, id: string, dto: AssignTaskDto) {
    await this.access.getManageable(tenant, id);

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock order: tasks → employees.
      const fresh = await this.lockFresh(tx, tenant, id);
      assertOpen(fresh);
      if (dto.assignedToId === fresh.assignedToId) return { task: fresh, changed: false };
      if (dto.assignedToId) {
        await this.employees.assertAssignable(tx, tenant, dto.assignedToId, fresh.branchId);
      }
      const task = await tx.task.update({
        where: { id },
        data: { assignedToId: dto.assignedToId },
        select: TASK_SELECT,
      });
      await this.history.record(tx, tenant, id, TaskActivityType.ASSIGNED, {
        oldValue: fresh.assignedToId,
        newValue: dto.assignedToId,
        note: dto.note,
      });
      return { task, changed: true, from: fresh.assignedToId };
    });

    if (result.changed) {
      this.events.publish(tenant, {
        name: DomainEventName.TASK_ASSIGNED,
        entityType: 'Task',
        entityId: id,
        payload: { from: result.from ?? null, to: dto.assignedToId },
      });
    }
    return present(result.task);
  }

  /** Soft delete: the task disappears from lists; its history and comments are kept. */
  async remove(tenant: TenantContext, id: string) {
    await this.access.getManageable(tenant, id);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockFresh(tx, tenant, id);
      const deleted = await tx.task.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: TASK_SELECT,
      });
      await this.history.record(tx, tenant, id, TaskActivityType.DELETED);
      return deleted;
    });
    this.events.publish(tenant, {
      name: DomainEventName.TASK_DELETED,
      entityType: 'Task',
      entityId: id,
      payload: {},
    });
    return present(task);
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /** `FOR UPDATE` on the task, then its fresh state (serializes concurrent changes). */
  private async lockFresh(tx: Tx, tenant: TenantContext, id: string): Promise<TaskRecord> {
    await lockRows(tx, 'tasks', [id], tenant.organizationId);
    const task = await tx.task.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: TASK_SELECT,
    });
    if (!task) throw AppException.notFound(ErrorCode.TASK_NOT_FOUND, 'Task not found');
    return task;
  }
}

function present(task: TaskRecord, now = new Date()) {
  return { ...task, isOverdue: isOverdue(task, now) };
}

function assertOpen(task: { status: TaskStatus }): void {
  if (isClosed(task.status)) {
    throw AppException.conflict(
      ErrorCode.TASK_CLOSED,
      `Task is ${task.status}; reopen it before making changes`,
    );
  }
}

function assertAssigneeMove(tenant: TenantContext, task: TaskRecord, to: TaskStatus): void {
  if (!isAssignedTo(tenant, task)) {
    throw accessDenied('Only the assignee can change the status of this task');
  }
  if (to === TaskStatus.CANCELLED || isClosed(task.status)) {
    throw accessDenied('Only task managers can cancel or reopen tasks');
  }
}

function statusActivity(status: TaskStatus): TaskActivityType {
  if (status === TaskStatus.COMPLETED) return TaskActivityType.COMPLETED;
  if (status === TaskStatus.CANCELLED) return TaskActivityType.CANCELLED;
  return TaskActivityType.STATUS_CHANGED;
}
