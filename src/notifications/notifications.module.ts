import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../config/env.validation';
import { NotificationsController } from './controllers/notifications.controller';
import {
  NotificationAdminController,
  NotificationPreferencesController,
  NotificationTemplatesController,
} from './controllers/notification-settings.controller';
import { DeliveryProcessor } from './delivery/delivery-processor';
import {
  NOTIFICATION_PROVIDERS,
  type NotificationProvider,
} from './delivery/notification-provider';
import {
  BullMqNotificationQueue,
  InlineNotificationQueue,
  NotificationQueue,
} from './delivery/notification-queue';
import { ProviderRegistry } from './delivery/provider-registry';
import { mockEmailProvider, mockSmsProvider } from './delivery/providers/mock.provider';
import { TelegramProvider } from './delivery/providers/telegram.provider';
import { AttendanceNotificationsHandler } from './handlers/attendance-notifications.handler';
import { FinanceNotificationsHandler } from './handlers/finance-notifications.handler';
import { LeadNotificationsHandler } from './handlers/lead-notifications.handler';
import { NotificationActivity } from './handlers/notification-activity';
import { TaskNotificationsHandler } from './handlers/task-notifications.handler';
import { NotificationAdminService } from './notification-admin.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsService } from './notifications.service';
import { NotificationPoliciesService } from './policies/notification-policies.service';
import { NotificationPreferencesService } from './preferences/notification-preferences.service';
import { RecipientsService } from './recipients.service';
import { NotificationScannerService } from './scanner/notification-scanner.service';
import { TelegramController } from './telegram/telegram.controller';
import { TelegramLinkService } from './telegram/telegram-link.service';
import { NotificationTemplatesService } from './templates/notification-templates.service';

type Config = ConfigService<EnvironmentVariables, true>;

/**
 * Notifications & communication. Business modules stay unaware of it: they
 * publish domain events; handlers here turn them into notifications.
 */
@Module({
  controllers: [
    NotificationsController,
    NotificationPreferencesController,
    NotificationTemplatesController,
    NotificationAdminController,
    TelegramController,
  ],
  providers: [
    NotificationsService,
    NotificationInboxService,
    NotificationAdminService,
    NotificationPoliciesService,
    NotificationPreferencesService,
    NotificationTemplatesService,
    RecipientsService,
    ProviderRegistry,
    DeliveryProcessor,
    NotificationActivity,
    NotificationScannerService,
    TelegramLinkService,
    TaskNotificationsHandler,
    FinanceNotificationsHandler,
    AttendanceNotificationsHandler,
    LeadNotificationsHandler,
    {
      // Providers are chosen by configuration; business code never names one.
      provide: NOTIFICATION_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: Config): NotificationProvider[] => {
        const providers: NotificationProvider[] = [];
        if (config.get('NOTIFICATION_EMAIL_PROVIDER', { infer: true }) === 'mock') {
          providers.push(mockEmailProvider());
        }
        if (config.get('NOTIFICATION_SMS_PROVIDER', { infer: true }) === 'mock') {
          providers.push(mockSmsProvider());
        }
        const botToken = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
        if (botToken) providers.push(new TelegramProvider(botToken));
        return providers;
      },
    },
    {
      provide: NotificationQueue,
      inject: [ConfigService, DeliveryProcessor],
      useFactory: (config: Config, processor: DeliveryProcessor): NotificationQueue => {
        const delay = config.get('NOTIFICATION_RETRY_DELAY_MS', { infer: true });
        const redisUrl = config.get('REDIS_URL', { infer: true });
        return redisUrl
          ? new BullMqNotificationQueue(redisUrl, processor, delay)
          : new InlineNotificationQueue(processor, delay);
      },
    },
  ],
  exports: [
    NotificationsService,
    NotificationInboxService,
    NotificationQueue,
    NotificationActivity,
  ],
})
export class NotificationsModule {}
