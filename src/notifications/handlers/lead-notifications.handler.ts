import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { type DomainEvent, DomainEventName } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { formatDateTime } from '../core/formatters';
import { NotificationsService } from '../notifications.service';
import { NotificationActivity } from './notification-activity';

/** lead.created (with assignee) / lead.assigned → LEAD_ASSIGNED to the new assignee. */
@Injectable()
export class LeadNotificationsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: NotificationActivity,
  ) {}

  @OnEvent(DomainEventName.LEAD_CREATED)
  onCreated(event: DomainEvent): void {
    this.activity.run('lead.created', () => this.assigned(event));
  }

  @OnEvent(DomainEventName.LEAD_ASSIGNED)
  onAssigned(event: DomainEvent): void {
    if (event.payload.assignedToId) this.activity.run('lead.assigned', () => this.assigned(event));
  }

  private async assigned(event: DomainEvent): Promise<void> {
    const [lead, actor, organization] = await Promise.all([
      this.prisma.lead.findFirst({
        where: { id: event.entityId, organizationId: event.organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          branchId: true,
          assignedToId: true,
          nextFollowUpAt: true,
          branch: { select: { name: true } },
        },
      }),
      this.prisma.user.findUnique({ where: { id: event.actorUserId }, select: { name: true } }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: event.organizationId },
        select: { timezone: true },
      }),
    ]);
    if (!lead?.assignedToId) return;

    await this.notifications.notify({
      organizationId: event.organizationId,
      branchId: lead.branchId,
      type: NotificationType.LEAD_ASSIGNED,
      eventKey: `LEAD_ASSIGNED:${event.eventId}`,
      subjectUserIds: [lead.assignedToId],
      actorUserId: event.actorUserId,
      relatedType: 'Lead',
      relatedId: lead.id,
      variables: {
        leadName: lead.name,
        leadPhone: lead.phone,
        assignedBy: actor?.name,
        followUpAt: lead.nextFollowUpAt
          ? formatDateTime(lead.nextFollowUpAt, organization.timezone)
          : '—',
        branchName: lead.branch.name,
      },
    });
  }
}
