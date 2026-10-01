import { NotificationChannel } from '@prisma/client';
import {
  type NotificationProvider,
  type OutgoingMessage,
  type ProviderResult,
} from '../notification-provider';

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: { message_id: number };
}

/**
 * Telegram Bot API `sendMessage`. Plain text only (no `parse_mode`), so
 * user-controlled values in templates can't inject markup.
 */
export class TelegramProvider implements NotificationProvider {
  readonly name = 'telegram-bot';
  readonly channel = NotificationChannel.TELEGRAM;

  constructor(
    private readonly botToken: string,
    private readonly apiBase = 'https://api.telegram.org',
    private readonly timeoutMs = 10_000,
  ) {}

  async send(message: OutgoingMessage): Promise<ProviderResult> {
    const response = await fetch(`${this.apiBase}/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.to,
        text: `${message.title}\n\n${message.message}`,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse;
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram API ${response.status}: ${body.description ?? 'request failed'}`);
    }
    return { providerMessageId: body.result ? String(body.result.message_id) : null };
  }
}
