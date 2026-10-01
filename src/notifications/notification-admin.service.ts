import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
  type Prisma,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { dayRangeFilter } from '../common/utils/date-range';
import { PrismaService } from '../database/prisma.service';
import { ALL_PERMISSION_KEYS } from '../permissions/permissions.catalog';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { NotificationQueue } from './delivery/notification-queue';
import { ProviderRegistry } from './delivery/provider-registry';
import {
  type ListDeliveriesQueryDto,
  type SendSystemNotificationDto,
} from './dto/notification.dto';
import { DELIVERY_SELECT } from './notification-inbox.service';
import { NotificationsService } from './notifications.service';

/** Organization-wide operations: system broadcasts, delivery history, retries, providers. */
@Injectable()
export class NotificationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly notifications: NotificationsService,
    private readonly registry: ProviderRegistry,
    private readonly queue: NotificationQueue,
  ) {}

  async sendSystem(tenant: TenantContext, dto: SendSystemNotificationDto) {
    if (!dto.userIds?.length && !dto.recipientPermission) {
      throw AppException.badRequest(
        ErrorCode.NOTIFICATION_NO_RECIPIENTS,
        'Provide userIds and/or recipientPermission',
      );
    }
    if (
      dto.recipientPermission &&
      !ALL_PERMISSION_KEYS.some((k) => k === dto.recipientPermission)
    ) {
      throw AppException.badRequest(
        ErrorCode.INVALID_PERMISSION_KEY,
        `Unknown permission: ${dto.recipientPermission}`,
      );
    }
    if (dto.branchId) await this.branches.assertWritableBranch(tenant, dto.branchId);

    const result = await this.notifications.notify({
      organizationId: tenant.organizationId,
      branchId: dto.branchId ?? null,
      type: NotificationType.SYSTEM,
      eventKey: `SYSTEM:${randomUUID()}`,
      subjectUserIds: dto.userIds,
      recipientPermission: dto.recipientPermission,
      priority: dto.priority ?? NotificationPriority.NORMAL,
      variables: { title: dto.title, message: dto.message },
    });
    if (result.created === 0) {
      throw AppException.badRequest(
        ErrorCode.NOTIFICATION_NO_RECIPIENTS,
        'No active members of this organization match the recipients',
      );
    }
    return result;
  }

  async listDeliveries(tenant: TenantContext, query: ListDeliveriesQueryDto) {
    const where: Prisma.NotificationDeliveryWhereInput = {
      organizationId: tenant.organizationId,
      channel: query.channel,
      status: query.status,
      notificationId: query.notificationId,
      createdAt: dayRangeFilter(query, tenant.timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: DELIVERY_SELECT,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  /** Gives a FAILED delivery a fresh round of attempts. */
  async retry(tenant: TenantContext, id: string) {
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true, status: true },
    });
    if (!delivery) {
      throw AppException.notFound(
        ErrorCode.NOTIFICATION_DELIVERY_NOT_FOUND,
        'Notification delivery not found',
      );
    }
    if (delivery.status !== NotificationDeliveryStatus.FAILED) {
      throw AppException.conflict(
        ErrorCode.NOTIFICATION_DELIVERY_NOT_RETRYABLE,
        `Only FAILED deliveries can be retried (this one is ${delivery.status})`,
      );
    }
    const updated = await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        failedAt: null,
        errorMessage: null,
      },
      select: DELIVERY_SELECT,
    });
    await this.queue.enqueue([id]);
    return updated;
  }

  providers() {
    return this.registry.status();
  }
}
