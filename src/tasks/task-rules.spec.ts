import { TaskStatus } from '@prisma/client';
import {
  canChangeTaskStatus,
  completionRate,
  isOverdue,
  overdueWhere,
  tallyTasks,
} from './task-rules';

describe('task rules', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const past = new Date('2026-09-29T12:00:00Z');

  it('overdue = past due and not closed', () => {
    expect(isOverdue({ status: TaskStatus.TODO, dueDate: past }, now)).toBe(true);
    expect(isOverdue({ status: TaskStatus.BLOCKED, dueDate: past }, now)).toBe(true);
    expect(isOverdue({ status: TaskStatus.COMPLETED, dueDate: past }, now)).toBe(false);
    expect(isOverdue({ status: TaskStatus.CANCELLED, dueDate: past }, now)).toBe(false);
    expect(isOverdue({ status: TaskStatus.TODO, dueDate: null }, now)).toBe(false);
    expect(isOverdue({ status: TaskStatus.TODO, dueDate: now }, now)).toBe(false);
    expect(overdueWhere(undefined, now)).toEqual({});
    expect(overdueWhere(false, now)).toEqual({
      OR: [
        { dueDate: null },
        { dueDate: { gte: now } },
        { status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] } },
      ],
    });
    expect(overdueWhere(true, now)).toEqual({
      dueDate: { lt: now },
      status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
    });
  });

  it('status transitions: open ↔ open, closed → reopen only, no no-ops', () => {
    expect(canChangeTaskStatus(TaskStatus.TODO, TaskStatus.IN_PROGRESS)).toBe(true);
    expect(canChangeTaskStatus(TaskStatus.BLOCKED, TaskStatus.COMPLETED)).toBe(true);
    expect(canChangeTaskStatus(TaskStatus.TODO, TaskStatus.TODO)).toBe(false);
    expect(canChangeTaskStatus(TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS)).toBe(true);
    expect(canChangeTaskStatus(TaskStatus.COMPLETED, TaskStatus.CANCELLED)).toBe(false);
    expect(canChangeTaskStatus(TaskStatus.CANCELLED, TaskStatus.BLOCKED)).toBe(false);
  });

  it('completion rate handles division by zero', () => {
    expect(completionRate(0, 0)).toBe(0);
    expect(completionRate(3, 1)).toBe(75);
    expect(completionRate(1, 2)).toBe(33.33);
    expect(completionRate(2, 0)).toBe(100);
  });

  it('tallies grouped counts', () => {
    const counts = tallyTasks(
      [
        { status: TaskStatus.TODO, _count: { _all: 2 } },
        { status: TaskStatus.COMPLETED, _count: { _all: 3 } },
      ],
      1,
    );
    expect(counts).toEqual({
      total: 5,
      todo: 2,
      inProgress: 0,
      blocked: 0,
      completed: 3,
      cancelled: 0,
      overdue: 1,
    });
  });
});
