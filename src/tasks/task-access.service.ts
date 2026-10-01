import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../database/prisma.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';

export const TASK_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  title: true,
  description: true,
  createdById: true,
  assignedToId: true,
  priority: true,
  status: true,
  dueDate: true,
  completedAt: true,
  relatedType: true,
  relatedId: true,
  batchId: true,
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, userId: true } },
  branch: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

export type TaskRecord = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Who sees which task:
 *  - `tasks.read`     → every task in the caller's branches (managers, admins);
 *  - `tasks.read_own` → tasks assigned to the caller's employee profile or created by the caller.
 */
@Injectable()
export class TaskAccessService {
  constructor(private readonly prisma: PrismaService) {}

  visibleWhere(tenant: TenantContext): Prisma.TaskWhereInput {
    const base = { organizationId: tenant.organizationId, deletedAt: null };
    if (tenant.permissions.has(PERMISSIONS.TASKS_READ)) {
      const restricted = restrictedBranchIds(tenant);
      return { ...base, ...(restricted && { branchId: { in: restricted } }) };
    }
    return { ...base, OR: ownTaskWhere(tenant) };
  }

  /** 404 outside the organization (or deleted), 403 when not visible to the caller. */
  async getVisible(tenant: TenantContext, id: string): Promise<TaskRecord> {
    const task = await this.find(tenant, id);
    if (tenant.permissions.has(PERMISSIONS.TASKS_READ)) {
      assertBranchAccess(tenant, task.branchId);
    } else if (!isOwnTask(tenant, task)) {
      throw accessDenied('You can only access your own tasks');
    }
    return task;
  }

  /** For branch-level management (update, assign, delete): branch access required. */
  async getManageable(tenant: TenantContext, id: string): Promise<TaskRecord> {
    const task = await this.find(tenant, id);
    assertBranchAccess(tenant, task.branchId);
    return task;
  }

  private async find(tenant: TenantContext, id: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: TASK_SELECT,
    });
    if (!task) throw AppException.notFound(ErrorCode.TASK_NOT_FOUND, 'Task not found');
    return task;
  }
}

export function ownTaskWhere(tenant: TenantContext): Prisma.TaskWhereInput[] {
  return [{ assignedTo: { userId: tenant.userId } }, { createdById: tenant.userId }];
}

export const isAssignedTo = (tenant: TenantContext, task: TaskRecord): boolean =>
  task.assignedTo?.userId === tenant.userId;

const isOwnTask = (tenant: TenantContext, task: TaskRecord): boolean =>
  isAssignedTo(tenant, task) || task.createdById === tenant.userId;

export const accessDenied = (message: string): AppException =>
  AppException.forbidden(ErrorCode.TASK_ACCESS_DENIED, message);
