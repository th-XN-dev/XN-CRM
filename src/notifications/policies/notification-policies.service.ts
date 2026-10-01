import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  type NotificationPolicy,
  type NotificationType,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { ALL_PERMISSION_KEYS } from '../../permissions/permissions.catalog';
import { type TenantContext } from '../../tenancy/tenant-context';
import { NOTIFICATION_TYPE_KEYS, NOTIFICATION_TYPES } from '../core/notification-types.catalog';
import { type UpdateNotificationPolicyDto } from '../dto/policy.dto';

export interface EffectivePolicy {
  type: NotificationType;
  priority: (typeof NOTIFICATION_TYPES)[NotificationType]['priority'];
  critical: boolean;
  isEnabled: boolean;
  recipientPermission: string | null;
  defaultChannels: NotificationChannel[];
  lockedChannels: NotificationChannel[];
  isCustomized: boolean;
}

/** Type-level policy: code defaults, overridden per organization. */
@Injectable()
export class NotificationPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async effective(organizationId: string, type: NotificationType): Promise<EffectivePolicy> {
    const row = await this.prisma.notificationPolicy.findUnique({
      where: { organizationId_type: { organizationId, type } },
    });
    return merge(type, row);
  }

  async list(tenant: TenantContext): Promise<EffectivePolicy[]> {
    const rows = await this.prisma.notificationPolicy.findMany({
      where: { organizationId: tenant.organizationId },
    });
    return NOTIFICATION_TYPE_KEYS.map((type) =>
      merge(
        type,
        rows.find((row) => row.type === type),
      ),
    );
  }

  async update(tenant: TenantContext, type: NotificationType, dto: UpdateNotificationPolicyDto) {
    const current = await this.effective(tenant.organizationId, type);
    if (current.critical && dto.isEnabled === false) {
      throw AppException.badRequest(
        ErrorCode.NOTIFICATION_TYPE_CRITICAL,
        `${type} is a critical notification type and cannot be disabled`,
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
    const data = {
      isEnabled: dto.isEnabled ?? current.isEnabled,
      recipientPermission:
        dto.recipientPermission === undefined
          ? current.recipientPermission
          : dto.recipientPermission,
      defaultChannels: dto.defaultChannels ?? current.defaultChannels,
      lockedChannels: dto.lockedChannels ?? current.lockedChannels,
    };
    const row = await this.prisma.notificationPolicy.upsert({
      where: { organizationId_type: { organizationId: tenant.organizationId, type } },
      create: { organizationId: tenant.organizationId, type, ...data },
      update: data,
    });
    return merge(type, row);
  }
}

function merge(
  type: NotificationType,
  row: NotificationPolicy | null | undefined,
): EffectivePolicy {
  const definition = NOTIFICATION_TYPES[type];
  const locked = row?.lockedChannels ?? definition.lockedChannels;
  return {
    type,
    priority: definition.priority,
    critical: definition.critical,
    // Critical types are always on and always reach the in-app inbox.
    isEnabled: definition.critical || (row?.isEnabled ?? definition.isEnabled),
    recipientPermission:
      row === null || row === undefined ? definition.recipientPermission : row.recipientPermission,
    defaultChannels: row?.defaultChannels ?? definition.defaultChannels,
    lockedChannels: definition.critical
      ? [...new Set([NotificationChannel.IN_APP, ...locked])]
      : locked,
    isCustomized: !!row,
  };
}
