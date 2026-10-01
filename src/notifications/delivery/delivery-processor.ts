import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { type EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import { type TemplateValues } from '../core/template-renderer';
import { NotificationTemplatesService } from '../templates/notification-templates.service';
import { ProviderRegistry } from './provider-registry';

export type ProcessResult =
  { status: 'done' } | { status: 'retry'; attempts: number; error: string };

interface Contact {
  email: string | null;
  phone: string | null;
  telegramAccount: { chatId: string; isVerified: boolean } | null;
}

/** The address a channel sends to, or null when the recipient has none. */
export function addressFor(channel: NotificationChannel, contact: Contact): string | null {
  switch (channel) {
    case NotificationChannel.TELEGRAM:
      return contact.telegramAccount?.isVerified ? contact.telegramAccount.chatId : null;
    case NotificationChannel.EMAIL:
      return contact.email;
    case NotificationChannel.SMS:
      return contact.phone;
    default:
      // IN_APP needs no address; PUSH has no device registry yet.
      return null;
  }
}

/**
 * Runs ONE attempt of one delivery and records the outcome. Retry scheduling
 * belongs to the queue: this only says whether another attempt is due.
 * Attempts are capped by NOTIFICATION_MAX_ATTEMPTS — never infinite.
 */
@Injectable()
export class DeliveryProcessor {
  private readonly logger = new Logger(DeliveryProcessor.name);
  readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly templates: NotificationTemplatesService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.maxAttempts = config.get('NOTIFICATION_MAX_ATTEMPTS', { infer: true });
  }

  async process(deliveryId: string): Promise<ProcessResult> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: {
          select: {
            id: true,
            organizationId: true,
            type: true,
            data: true,
            recipient: {
              select: {
                email: true,
                phone: true,
                telegramAccount: { select: { chatId: true, isVerified: true } },
              },
            },
          },
        },
      },
    });
    if (!delivery || delivery.status !== NotificationDeliveryStatus.PENDING)
      return { status: 'done' };

    const attempts = delivery.attempts + 1;
    const { notification } = delivery;
    const provider = this.registry.get(delivery.channel);
    if (!provider) {
      await this.finish(deliveryId, NotificationDeliveryStatus.FAILED, attempts, {
        errorMessage: `No provider configured for ${delivery.channel}`,
      });
      return { status: 'done' };
    }
    const to = addressFor(delivery.channel, notification.recipient);
    if (!to) {
      await this.finish(deliveryId, NotificationDeliveryStatus.CANCELLED, attempts, {
        provider: provider.name,
        errorMessage: `Recipient has no ${delivery.channel} address`,
      });
      return { status: 'done' };
    }

    try {
      const text = await this.templates.render(
        notification.organizationId,
        notification.type,
        delivery.channel,
        notification.data as TemplateValues,
      );
      const result = await provider.send({ to, notificationId: notification.id, ...text });
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationDeliveryStatus.SENT,
          attempts,
          provider: provider.name,
          providerMessageId: result.providerMessageId ?? null,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      return { status: 'done' };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      if (attempts >= this.maxAttempts) {
        this.logger.warn(`Delivery ${deliveryId} failed after ${attempts} attempts: ${message}`);
        await this.finish(deliveryId, NotificationDeliveryStatus.FAILED, attempts, {
          provider: provider.name,
          errorMessage: message,
        });
        return { status: 'done' };
      }
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { attempts, provider: provider.name, errorMessage: message },
      });
      return { status: 'retry', attempts, error: message };
    }
  }

  private finish(
    id: string,
    status: NotificationDeliveryStatus,
    attempts: number,
    extra: { provider?: string; errorMessage: string },
  ) {
    return this.prisma.notificationDelivery.update({
      where: { id },
      data: { status, attempts, failedAt: new Date(), ...extra },
    });
  }
}
