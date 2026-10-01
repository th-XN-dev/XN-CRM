import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  type NotificationPriority,
  type NotificationType,
  type Prisma,
} from '@prisma/client';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { NOTIFICATION_TYPES } from './core/notification-types.catalog';
import { pickAllowed, type TemplateValues } from './core/template-renderer';
import { addressFor } from './delivery/delivery-processor';
import { NotificationQueue } from './delivery/notification-queue';
import { ProviderRegistry } from './delivery/provider-registry';
import { NotificationPoliciesService } from './policies/notification-policies.service';
import { NotificationPreferencesService } from './preferences/notification-preferences.service';
import { RecipientsService } from './recipients.service';
import { NotificationTemplatesService } from './templates/notification-templates.service';

export interface NotifyInput {
  organizationId: string;
  /** Branch the event happened in; null for organization-wide notifications. */
  branchId?: string | null;
  type: NotificationType;
  /**
   * Idempotency key of the source event (e.g. "PAYMENT_RECEIVED:<paymentId>").
   * A recipient is notified at most once per key.
   */
  eventKey: string;
  /** Users the event is directly about (assignee...). */
  subjectUserIds?: (string | null | undefined)[];
  /** Extra permission-based audience on top of the type policy (system notifications). */
  recipientPermission?: string;
  /** Never notified about their own action. */
  actorUserId?: string | null;
  relatedType?: string;
  relatedId?: string;
  /** Template variables; only the type's allow-listed ones are kept. */
  variables: TemplateValues;
  priority?: NotificationPriority;
}

export interface NotifyResult {
  created: number;
  duplicates: number;
}

/**
 * The single entry point for creating notifications. Business modules never
 * call it directly: event handlers translate domain events into `notify()`.
 * Recipients, channels and texts come from policy, preferences and templates;
 * external deliveries are only queued — no provider is called here.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: NotificationPoliciesService,
    private readonly preferences: NotificationPreferencesService,
    private readonly templates: NotificationTemplatesService,
    private readonly recipients: RecipientsService,
    private readonly registry: ProviderRegistry,
    private readonly queue: NotificationQueue,
  ) {}

  async notify(input: NotifyInput): Promise<NotifyResult> {
    const result: NotifyResult = { created: 0, duplicates: 0 };
    const { organizationId, type } = input;
    const policy = await this.policies.effective(organizationId, type);
    if (!policy.isEnabled) return result;

    const branchId = input.branchId ?? null;
    const permissions = [policy.recipientPermission, input.recipientPermission].filter(
      (p): p is string => !!p,
    );
    const subjects = await this.recipients.activeMembers(
      organizationId,
      (input.subjectUserIds ?? []).filter((id): id is string => !!id),
    );
    const watchers = (
      await Promise.all(
        permissions.map((p) => this.recipients.withPermission(organizationId, branchId, p)),
      )
    ).flat();
    const candidates = [...new Set([...subjects, ...watchers])].filter(
      (userId) => userId !== input.actorUserId,
    );
    if (candidates.length === 0) return result;

    // Idempotency: skip everyone this event already reached.
    const already = await this.prisma.notification.findMany({
      where: { organizationId, eventKey: input.eventKey, recipientUserId: { in: candidates } },
      select: { recipientUserId: true },
    });
    const reached = new Set(already.map((row) => row.recipientUserId));
    result.duplicates = reached.size;
    const recipients = candidates.filter((userId) => !reached.has(userId));
    if (recipients.length === 0) return result;

    const data = pickAllowed(input.variables, NOTIFICATION_TYPES[type].variables);
    const [channelsByUser, contacts, text] = await Promise.all([
      this.preferences.channelsFor(organizationId, recipients, policy),
      this.recipients.contacts(recipients),
      this.templates.render(organizationId, type, NotificationChannel.IN_APP, data),
    ]);

    const pending: string[] = [];
    for (const userId of recipients) {
      const channels = channelsByUser.get(userId) ?? [];
      const contact = contacts.find((c) => c.id === userId);
      const inApp = channels.includes(NotificationChannel.IN_APP);
      // Only channels that can actually reach this user: a provider exists and so does an address.
      const external = channels.filter(
        (channel) =>
          channel !== NotificationChannel.IN_APP &&
          !!this.registry.get(channel) &&
          !!contact &&
          addressFor(channel, contact) !== null,
      );
      if (!inApp && external.length === 0) continue;

      try {
        const ids = await this.prisma.$transaction((tx) =>
          this.createWithDeliveries(tx, input, { userId, branchId, data, text, inApp, external }),
        );
        pending.push(...ids);
        result.created++;
      } catch (error) {
        // A concurrent handler of the same event won the race: already notified.
        if (isUniqueViolation(error)) {
          result.duplicates++;
          continue;
        }
        throw error;
      }
    }

    // After commit: hand external deliveries to the worker.
    if (pending.length > 0) {
      await this.queue.enqueue(pending).catch((error: unknown) => {
        // Deliveries stay PENDING; the scanner re-enqueues them.
        this.logger.error(`Failed to enqueue deliveries: ${String(error)}`);
      });
    }
    return result;
  }

  private async createWithDeliveries(
    tx: Prisma.TransactionClient,
    input: NotifyInput,
    target: {
      userId: string;
      branchId: string | null;
      data: TemplateValues;
      text: { title: string; message: string };
      inApp: boolean;
      external: NotificationChannel[];
    },
  ): Promise<string[]> {
    const { organizationId, type } = input;
    const notification = await tx.notification.create({
      data: {
        organizationId,
        branchId: target.branchId,
        type,
        title: target.text.title,
        message: target.text.message,
        priority: input.priority ?? NOTIFICATION_TYPES[type].priority,
        recipientUserId: target.userId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        eventKey: input.eventKey,
        data: target.data,
        inApp: target.inApp,
      },
      select: { id: true },
    });
    const now = new Date();
    if (target.inApp) {
      // The in-app channel is delivered by the write itself.
      await tx.notificationDelivery.create({
        data: {
          organizationId,
          notificationId: notification.id,
          channel: NotificationChannel.IN_APP,
          status: NotificationDeliveryStatus.DELIVERED,
          provider: 'in-app',
          attempts: 1,
          sentAt: now,
          deliveredAt: now,
        },
      });
    }
    const ids: string[] = [];
    for (const channel of target.external) {
      const delivery = await tx.notificationDelivery.create({
        data: { organizationId, notificationId: notification.id, channel },
        select: { id: true },
      });
      ids.push(delivery.id);
    }
    return ids;
  }
}
