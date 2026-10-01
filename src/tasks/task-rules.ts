import { type Prisma, TaskStatus } from '@prisma/client';

/** Finished tasks: never overdue; reopening them is a deliberate action. */
export const CLOSED_TASK_STATUSES: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

export const isClosed = (status: TaskStatus): boolean => CLOSED_TASK_STATUSES.includes(status);

/** Overdue = past its due date and not finished. Derived; never stored. */
export function isOverdue(task: { status: TaskStatus; dueDate: Date | null }, now: Date): boolean {
  return !!task.dueDate && task.dueDate < now && !isClosed(task.status);
}

export function overdueWhere(overdue: boolean | undefined, now: Date): Prisma.TaskWhereInput {
  if (overdue === undefined) return {};
  if (overdue) return { dueDate: { lt: now }, status: { notIn: CLOSED_TASK_STATUSES } };
  // Spelled out instead of NOT(...): SQL's NOT over a NULL dueDate would drop undated tasks.
  return {
    OR: [{ dueDate: null }, { dueDate: { gte: now } }, { status: { in: CLOSED_TASK_STATUSES } }],
  };
}

/**
 * Any change between open statuses is allowed; a closed task can only be
 * reopened (back to TODO or IN_PROGRESS). A no-op change is rejected.
 */
export function canChangeTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  if (isClosed(from)) return to === TaskStatus.TODO || to === TaskStatus.IN_PROGRESS;
  return true;
}

/** Waiting (BLOCKED) and cancelled tasks carry the reason they aren't done. */
export const needsReason = (status: TaskStatus): boolean =>
  status === TaskStatus.BLOCKED || status === TaskStatus.CANCELLED;

/** completed / (completed + cancelled) × 100, two decimals; 0 when nothing is closed. */
export function completionRate(completed: number, cancelled: number): number {
  const closed = completed + cancelled;
  return closed === 0 ? 0 : Math.round((completed / closed) * 10_000) / 100;
}

export interface TaskCounts {
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

/** Folds a `groupBy(status)` result (+ a separate overdue count) into flat counters. */
export function tallyTasks(
  rows: { status: TaskStatus; _count: { _all: number } }[],
  overdue: number,
): TaskCounts {
  const by = (status: TaskStatus) => rows.find((row) => row.status === status)?._count._all ?? 0;
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    todo: by(TaskStatus.TODO),
    inProgress: by(TaskStatus.IN_PROGRESS),
    blocked: by(TaskStatus.BLOCKED),
    completed: by(TaskStatus.COMPLETED),
    cancelled: by(TaskStatus.CANCELLED),
    overdue,
  };
}
