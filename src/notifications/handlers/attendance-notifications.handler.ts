import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttendanceStatus, NotificationType, type Prisma } from '@prisma/client';
import { type DomainEvent, DomainEventName } from '../../common/events/domain-events';
import { parseDateOnly } from '../../common/utils/dates';
import { PrismaService } from '../../database/prisma.service';
import { formatDate, personName } from '../core/formatters';
import { NotificationsService } from '../notifications.service';
import { NotificationActivity } from './notification-activity';

const TYPE_BY_STATUS: Partial<Record<AttendanceStatus, NotificationType>> = {
  [AttendanceStatus.ABSENT]: NotificationType.ATTENDANCE_ABSENT,
  [AttendanceStatus.LATE]: NotificationType.ATTENDANCE_LATE,
};

const MARK_SELECT = {
  id: true,
  status: true,
  date: true,
  branchId: true,
  enrollment: {
    select: { student: { select: { id: true, firstName: true, lastName: true } } },
  },
  group: {
    select: {
      name: true,
      branch: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.AttendanceSelect;

type Mark = Prisma.AttendanceGetPayload<{ select: typeof MARK_SELECT }>;

/**
 * ABSENT / LATE marks → ATTENDANCE_ABSENT / ATTENDANCE_LATE. Who receives them
 * is the type policy's business (default: members with attendance.read in the
 * branch), so it's configurable per organization without touching this code.
 */
@Injectable()
export class AttendanceNotificationsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: NotificationActivity,
  ) {}

  /** Bulk marking of a group for a day (entityId = group). */
  @OnEvent(DomainEventName.ATTENDANCE_MARKED)
  onMarked(event: DomainEvent): void {
    this.activity.run('attendance.marked', async () => {
      const marks = await this.prisma.attendance.findMany({
        where: {
          organizationId: event.organizationId,
          groupId: event.entityId,
          date: parseDateOnly(event.payload.date as string),
          status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.LATE] },
        },
        select: MARK_SELECT,
      });
      for (const mark of marks) await this.notify(event, mark);
    });
  }

  /** A single mark changed (entityId = attendance). */
  @OnEvent(DomainEventName.ATTENDANCE_UPDATED)
  onUpdated(event: DomainEvent): void {
    this.activity.run('attendance.updated', async () => {
      const mark = await this.prisma.attendance.findFirst({
        where: { id: event.entityId, organizationId: event.organizationId },
        select: MARK_SELECT,
      });
      if (mark) await this.notify(event, mark);
    });
  }

  private async notify(event: DomainEvent, mark: Mark): Promise<void> {
    const type = TYPE_BY_STATUS[mark.status];
    if (!type) return;
    const { student } = mark.enrollment;
    await this.notifications.notify({
      organizationId: event.organizationId,
      branchId: mark.branchId,
      type,
      // Once per mark and status: re-saving the same mark does not repeat it.
      eventKey: `${type}:${mark.id}`,
      actorUserId: event.actorUserId,
      relatedType: 'Student',
      relatedId: student.id,
      variables: {
        studentName: personName(student),
        groupName: mark.group.name,
        teacherName: mark.group.teacher ? personName(mark.group.teacher) : '—',
        date: formatDate(mark.date),
        branchName: mark.group.branch.name,
      },
    });
  }
}
