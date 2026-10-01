import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { type DomainEvent, DomainEventName } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { formatDateTime } from '../core/formatters';
import { NotificationsService } from '../notifications.service';
import { NotificationActivity } from './notification-activity';

/** task.created (with assignee) / task.assigned → TASK_ASSIGNED to the assignee's login. */
@Injectable()
export class TaskNotificationsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: NotificationActivity,
  ) {}

  @OnEvent(DomainEventName.TASK_CREATED)
  onCreated(event: DomainEvent): void {
    const employeeId = event.payload.assignedToId as string | null | undefined;
    if (employeeId) this.activity.run('task.created', () => this.assigned(event, employeeId));
  }

  @OnEvent(DomainEventName.TASK_ASSIGNED)
  onAssigned(event: DomainEvent): void {
    const employeeId = event.payload.to as string | null | undefined;
    if (employeeId) this.activity.run('task.assigned', () => this.assigned(event, employeeId));
  }

  private async assigned(event: DomainEvent, employeeId: string): Promise<void> {
    const organizationId = event.organizationId;
    const [task, employee, actor, organization] = await Promise.all([
      this.prisma.task.findFirst({
        where: { id: event.entityId, organizationId, deletedAt: null },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          branchId: true,
          branch: { select: { name: true } },
        },
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, organizationId },
        select: { userId: true },
      }),
      this.prisma.user.findUnique({ where: { id: event.actorUserId }, select: { name: true } }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      }),
    ]);
    // Employees without a CRM login have no inbox.
    if (!task || !employee?.userId) return;

    await this.notifications.notify({
      organizationId,
      branchId: task.branchId,
      type: NotificationType.TASK_ASSIGNED,
      eventKey: `TASK_ASSIGNED:${event.eventId}`,
      subjectUserIds: [employee.userId],
      actorUserId: event.actorUserId,
      relatedType: 'Task',
      relatedId: task.id,
      variables: {
        taskTitle: task.title,
        dueDate: task.dueDate ? formatDateTime(task.dueDate, organization.timezone) : '—',
        priority: task.priority,
        assignedBy: actor?.name,
        branchName: task.branch.name,
      },
    });
  }
}
