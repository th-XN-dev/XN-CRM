import { Injectable, Logger } from '@nestjs/common';
import { InlineNotificationQueue, NotificationQueue } from '../delivery/notification-queue';

/**
 * Runs event-handler work outside the publisher's call stack, logs failures
 * (a notification problem must never break the business request) and lets
 * callers wait until all in-flight work — including the in-process queue — is done.
 */
@Injectable()
export class NotificationActivity {
  private readonly logger = new Logger('NotificationHandlers');
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly queue: NotificationQueue) {}

  run(label: string, work: () => Promise<unknown>): void {
    const promise = Promise.resolve()
      .then(work)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          `${label} failed: ${error instanceof Error ? error.stack : String(error)}`,
        );
      })
      .finally(() => this.inFlight.delete(promise));
    this.inFlight.add(promise);
  }

  /**
   * Resolves when event handlers — and, unless `includeQueue` is false, the
   * in-process delivery queue — are idle. Graceful shutdown waits for handlers
   * only: queued deliveries stay PENDING in the database and resume on restart.
   */
  async idle({ includeQueue = true }: { includeQueue?: boolean } = {}): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
    if (includeQueue && this.queue instanceof InlineNotificationQueue) await this.queue.onIdle();
    if (this.inFlight.size > 0) await this.idle({ includeQueue });
  }
}
