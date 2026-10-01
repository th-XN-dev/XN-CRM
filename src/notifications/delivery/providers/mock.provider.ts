import { randomUUID } from 'node:crypto';
import { NotificationChannel } from '@prisma/client';
import {
  type NotificationProvider,
  type OutgoingMessage,
  type ProviderResult,
} from '../notification-provider';

/**
 * In-memory provider for development and tests: records what it "sent" and
 * can be told to fail the next N calls to exercise retries.
 */
export class MockProvider implements NotificationProvider {
  readonly sent: OutgoingMessage[] = [];
  private failuresLeft = 0;
  private failureMessage = 'Mock provider failure';

  constructor(
    readonly channel: NotificationChannel,
    readonly name: string,
  ) {}

  /** Makes the next `times` sends throw (`Infinity` → always). */
  failNext(times: number, message = 'Mock provider failure'): void {
    this.failuresLeft = times;
    this.failureMessage = message;
  }

  reset(): void {
    this.sent.length = 0;
    this.failuresLeft = 0;
  }

  send(message: OutgoingMessage): Promise<ProviderResult> {
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      return Promise.reject(new Error(this.failureMessage));
    }
    this.sent.push(message);
    return Promise.resolve({ providerMessageId: `${this.name}-${randomUUID()}` });
  }
}

export const mockEmailProvider = () => new MockProvider(NotificationChannel.EMAIL, 'mock-email');
export const mockSmsProvider = () => new MockProvider(NotificationChannel.SMS, 'mock-sms');
