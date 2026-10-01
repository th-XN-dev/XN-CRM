import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { dayRangeFilter } from '../common/utils/date-range';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { type ListNotificationsQueryDto } from './dto/notification.dto';

export const NOTIFICATION_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  type: true,
  title: true,
  message: true,
  priority: true,
  recipientUserId: true,
  relatedType: true,
  relatedId: true,
  data: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export const DELIVERY_SELECT = {
  id: true,
  notificationId: true,
  channel: true,
  status: true,
  provider: true,
  providerMessageId: true,
  sentAt: true,
  deliveredAt: true,
  failedAt: true,
  errorMessage: true,
  attempts: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationDeliverySelect;

/**
 * The caller's own in-app notifications. Every query is pinned to
 * (organization, recipient = caller): another user's id is simply "not found".
 */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext, query: ListNotificationsQueryDto, unreadOnly = false) {
    const where: Prisma.NotificationWhereInput = {
      ...ownWhere(tenant),
      type: query.type,
      priority: query.priority,
      isRead: unreadOnly ? false : query.isRead,
      createdAt: dayRangeFilter(query, tenant.timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
        ...pageArgs(query),
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  /** Count only (served by a partial index) — no rows leave the database. */
  async unreadCount(tenant: TenantContext): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { ...ownWhere(tenant), isRead: false },
    });
    return { count };
  }

  async markRead(tenant: TenantContext, id: string) {
    const notification = await this.getOwn(tenant, id);
    if (notification.isRead) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
      select: NOTIFICATION_SELECT,
    });
  }

  async markAllRead(tenant: TenantContext): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...ownWhere(tenant), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: count };
  }

  /** Hides the notification from the inbox; its delivery history is kept. */
  async remove(tenant: TenantContext, id: string) {
    await this.getOwn(tenant, id);
    return this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: NOTIFICATION_SELECT,
    });
  }

  async deliveries(tenant: TenantContext, id: string) {
    await this.getOwn(tenant, id);
    return this.prisma.notificationDelivery.findMany({
      where: { notificationId: id, organizationId: tenant.organizationId },
      orderBy: { channel: 'asc' },
      select: DELIVERY_SELECT,
    });
  }

  private async getOwn(tenant: TenantContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, ...ownWhere(tenant) },
      select: NOTIFICATION_SELECT,
    });
    if (!notification) {
      throw AppException.notFound(ErrorCode.NOTIFICATION_NOT_FOUND, 'Notification not found');
    }
    return notification;
  }
}

function ownWhere(tenant: TenantContext): Prisma.NotificationWhereInput {
  return {
    organizationId: tenant.organizationId,
    recipientUserId: tenant.userId,
    deletedAt: null,
    inApp: true,
  };
}
