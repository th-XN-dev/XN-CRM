import { Inject, Injectable } from '@nestjs/common';
import { type NotificationChannel } from '@prisma/client';
import { ALL_CHANNELS } from '../core/notification-types.catalog';
import { NOTIFICATION_PROVIDERS, type NotificationProvider } from './notification-provider';

/** The configured provider for each external channel (IN_APP needs none). */
@Injectable()
export class ProviderRegistry {
  private readonly byChannel: Map<NotificationChannel, NotificationProvider>;

  constructor(@Inject(NOTIFICATION_PROVIDERS) providers: NotificationProvider[]) {
    this.byChannel = new Map(providers.map((provider) => [provider.channel, provider]));
  }

  get(channel: NotificationChannel): NotificationProvider | undefined {
    return this.byChannel.get(channel);
  }

  /** Configuration overview (no secrets). */
  status() {
    return ALL_CHANNELS.map((channel) => {
      const provider = this.byChannel.get(channel);
      return {
        channel,
        configured: channel === 'IN_APP' || !!provider,
        provider: channel === 'IN_APP' ? 'in-app' : (provider?.name ?? null),
      };
    });
  }
}
