import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EmployeeStatus, NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type Occasion,
  type SendAnnouncementDto,
  type SendCongratulationDto,
} from './dto/communication.dto';

/** Default headline per occasion (the message is the sender's own words). */
const OCCASION_TITLES: Record<Occasion, string> = {
  BIRTHDAY: 'Tug‘ilgan kuningiz bilan!',
  WORK_ANNIVERSARY: 'Ish yilligingiz bilan!',
  ACHIEVEMENT: 'Yutug‘ingiz bilan tabriklaymiz!',
  THANKS: 'Rahmat!',
  OTHER: 'Tabriklaymiz!',
};

type SentRow = {
  eventKey: string;
  title: string;
  message: string;
  senderName: string | null;
  occasion: string | null;
  sentAt: Date;
  recipients: number;
  read: number;
};

/**
 * Communications that are not tasks: leadership announcements and
 * congratulations. Both are delivered by the notification system (inbox,
 * Telegram…), each with its own type, so they are listed and filtered apart.
 */
@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
  ) {}

  async announce(tenant: TenantContext, dto: SendAnnouncementDto) {
    if (dto.branchId) await this.branches.assertWritableBranch(tenant, dto.branchId);
    const branchId = dto.branchId ?? null;
    const eventKey = `ANNOUNCEMENT:${randomUUID()}`;
    const sender = await this.senderName(tenant.userId);
    const result = await this.notifications.notify({
      organizationId: tenant.organizationId,
      branchId,
      type: NotificationType.ANNOUNCEMENT,
      eventKey,
      subjectUserIds: dto.audience === 'users' ? dto.userIds : [],
      // Everyone who can read notifications (= all staff), in the branch when given.
      recipientPermission: dto.audience === 'everyone' ? PERMISSIONS.NOTIFICATIONS_READ : undefined,
      actorUserId: tenant.userId,
      priority: dto.priority ?? NotificationPriority.NORMAL,
      variables: {
        title: dto.title,
        message: dto.message,
        senderName: sender,
        senderId: tenant.userId,
      },
    });
    if (result.created === 0) throw noRecipients('Nobody to send this announcement to');
    this.events.publish(tenant, {
      name: DomainEventName.ANNOUNCEMENT_SENT,
      entityType: 'Announcement',
      entityId: eventKey.slice('ANNOUNCEMENT:'.length),
      payload: { branchId, title: dto.title, audience: dto.audience, recipients: result.created },
    });
    return { recipients: result.created };
  }

  async congratulate(tenant: TenantContext, dto: SendCongratulationDto) {
    const restricted = restrictedBranchIds(tenant);
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: dto.employeeIds },
        organizationId: tenant.organizationId,
        ...(restricted && { branches: { some: { branchId: { in: restricted } } } }),
      },
      select: { id: true, userId: true },
    });
    const userIds = employees.map((e) => e.userId).filter((id): id is string => !!id);
    if (userIds.length === 0) {
      throw noRecipients('None of these employees has an account to receive it');
    }
    const eventKey = `CONGRATULATION:${randomUUID()}`;
    const result = await this.notifications.notify({
      organizationId: tenant.organizationId,
      type: NotificationType.CONGRATULATION,
      eventKey,
      subjectUserIds: userIds,
      actorUserId: tenant.userId,
      variables: {
        title: OCCASION_TITLES[dto.occasion],
        message: dto.message,
        senderName: await this.senderName(tenant.userId),
        senderId: tenant.userId,
        occasion: dto.occasion,
      },
    });
    if (result.created === 0) throw noRecipients('Nobody could receive this congratulation');
    this.events.publish(tenant, {
      name: DomainEventName.CONGRATULATION_SENT,
      entityType: 'Congratulation',
      entityId: eventKey.slice('CONGRATULATION:'.length),
      payload: {
        occasion: dto.occasion,
        employeeIds: employees.map((e) => e.id),
        recipients: result.created,
      },
    });
    return { recipients: result.created };
  }

  /** What was sent (one row per message) with how many read it. */
  sent(tenant: TenantContext, type: 'ANNOUNCEMENT' | 'CONGRATULATION', limit: number) {
    return this.prisma.$queryRaw<SentRow[]>(Prisma.sql`
      SELECT n.event_key AS "eventKey",
             MIN(n.title) AS title,
             MIN(n.message) AS message,
             MIN(n.data->>'senderName') AS "senderName",
             MIN(n.data->>'occasion') AS occasion,
             MIN(n.created_at) AS "sentAt",
             COUNT(*)::int AS recipients,
             (COUNT(*) FILTER (WHERE n.is_read))::int AS read
      FROM notifications n
      WHERE n.organization_id = ${tenant.organizationId}::uuid
        AND n.type = ${type}::"NotificationType"
      GROUP BY n.event_key
      ORDER BY MIN(n.created_at) DESC
      LIMIT ${limit}`);
  }

  /** Birthdays and work anniversaries of active employees in the next `days` days. */
  async occasions(tenant: TenantContext, days: number) {
    const restricted = restrictedBranchIds(tenant);
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE] },
        ...(restricted && { branches: { some: { branchId: { in: restricted } } } }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        birthDate: true,
        hireDate: true,
      },
    });
    const today = todayIn(tenant.timezone);
    const result = [];
    for (const e of employees) {
      const employee = { id: e.id, name: `${e.firstName} ${e.lastName}`, hasAccount: !!e.userId };
      for (const [occasion, date] of [
        ['BIRTHDAY', e.birthDate],
        ['WORK_ANNIVERSARY', e.hireDate],
      ] as const) {
        if (!date) continue;
        const next = nextAnniversary(date, today);
        const daysLeft = Math.round((next.getTime() - today.getTime()) / 86_400_000);
        const years = next.getUTCFullYear() - date.getUTCFullYear();
        // A work anniversary starts after the first full year.
        if (daysLeft >= days || years < 1) continue;
        result.push({ employee, occasion, date: next.toISOString().slice(0, 10), daysLeft, years });
      }
    }
    return result.sort(
      (a, b) => a.daysLeft - b.daysLeft || a.employee.name.localeCompare(b.employee.name),
    );
  }

  private async senderName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? '';
  }
}

/** The next date (today or later) with the same month/day; 29 Feb → 28 Feb in common years. */
export function nextAnniversary(original: Date, today: Date): Date {
  const make = (year: number) => {
    const month = original.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(original.getUTCDate(), lastDay)));
  };
  const thisYear = make(today.getUTCFullYear());
  return thisYear >= today ? thisYear : make(today.getUTCFullYear() + 1);
}

const noRecipients = (message: string): AppException =>
  AppException.badRequest(ErrorCode.CONGRATULATION_NO_RECIPIENTS, message);
