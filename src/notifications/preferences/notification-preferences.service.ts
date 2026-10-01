import { Injectable } from '@nestjs/common';
import { type NotificationChannel, type NotificationPreference } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import {
  ALL_CHANNELS,
  CHANNEL_PREFERENCE_FIELD,
  type PreferenceField,
} from '../core/notification-types.catalog';
import { type UpdateNotificationPreferencesDto } from '../dto/preference.dto';
import {
  type EffectivePolicy,
  NotificationPoliciesService,
} from '../policies/notification-policies.service';

type Flags = Record<PreferenceField, boolean>;

/** A user's channels for a type: their choices over the policy defaults; locked channels always on. */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: NotificationPoliciesService,
  ) {}

  async list(tenant: TenantContext) {
    const [policies, rows] = await Promise.all([
      this.policies.list(tenant),
      this.prisma.notificationPreference.findMany({
        where: { organizationId: tenant.organizationId, userId: tenant.userId },
      }),
    ]);
    return policies.map((policy) =>
      present(
        policy,
        rows.find((row) => row.type === policy.type),
      ),
    );
  }

  async update(tenant: TenantContext, dto: UpdateNotificationPreferencesDto) {
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const policy = await this.policies.effective(tenant.organizationId, item.type);
        const current = await tx.notificationPreference.findUnique({
          where: {
            userId_organizationId_type: {
              userId: tenant.userId,
              organizationId: tenant.organizationId,
              type: item.type,
            },
          },
        });
        const flags = { ...effectiveFlags(policy, current) };
        for (const channel of ALL_CHANNELS) {
          const field = CHANNEL_PREFERENCE_FIELD[channel];
          const requested = item[field];
          if (requested === undefined) continue;
          if (!requested && policy.lockedChannels.includes(channel)) {
            throw AppException.badRequest(
              ErrorCode.NOTIFICATION_CHANNEL_LOCKED,
              `${channel} cannot be turned off for ${item.type}`,
            );
          }
          flags[field] = requested;
        }
        await tx.notificationPreference.upsert({
          where: {
            userId_organizationId_type: {
              userId: tenant.userId,
              organizationId: tenant.organizationId,
              type: item.type,
            },
          },
          create: {
            userId: tenant.userId,
            organizationId: tenant.organizationId,
            type: item.type,
            ...flags,
          },
          update: flags,
        });
      }
    });
    return this.list(tenant);
  }

  /** Enabled channels per recipient, in one query for all of them. */
  async channelsFor(
    organizationId: string,
    userIds: string[],
    policy: EffectivePolicy,
  ): Promise<Map<string, NotificationChannel[]>> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { organizationId, type: policy.type, userId: { in: userIds } },
    });
    return new Map(
      userIds.map((userId) => {
        const flags = effectiveFlags(
          policy,
          rows.find((row) => row.userId === userId),
        );
        return [userId, ALL_CHANNELS.filter((channel) => flags[CHANNEL_PREFERENCE_FIELD[channel]])];
      }),
    );
  }
}

function effectiveFlags(
  policy: EffectivePolicy,
  row: NotificationPreference | null | undefined,
): Flags {
  return Object.fromEntries(
    ALL_CHANNELS.map((channel) => {
      const field = CHANNEL_PREFERENCE_FIELD[channel];
      const chosen = row ? row[field] : policy.defaultChannels.includes(channel);
      return [field, chosen || policy.lockedChannels.includes(channel)];
    }),
  ) as Flags;
}

function present(policy: EffectivePolicy, row: NotificationPreference | undefined) {
  return {
    type: policy.type,
    ...effectiveFlags(policy, row),
    lockedChannels: policy.lockedChannels,
    isCustomized: !!row,
  };
}
