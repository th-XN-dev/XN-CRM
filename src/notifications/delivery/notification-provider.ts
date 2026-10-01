import { type NotificationChannel } from '@prisma/client';

export interface OutgoingMessage {
  /** Channel address: Telegram chat id, email address, phone number... */
  to: string;
  title: string;
  message: string;
  notificationId: string;
}

export interface ProviderResult {
  providerMessageId?: string | null;
}

/**
 * A delivery channel implementation (Telegram bot, SMTP, SMS gateway...).
 * Business modules never see providers: they emit events, the notification
 * layer picks the provider for each channel. `send` throws on failure;
 * retries are handled by the queue, not by providers.
 */
export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: OutgoingMessage): Promise<ProviderResult>;
}

/** DI token for the configured providers (`NotificationProvider[]`). */
export const NOTIFICATION_PROVIDERS = Symbol('NOTIFICATION_PROVIDERS');
