import { Injectable, Logger } from '@nestjs/common';

/**
 * Fire-and-forget work started by event handlers (audit writes...), run after
 * the publisher returns. Failures are logged, never thrown into the request;
 * `idle()` lets shutdown and tests wait for everything still in flight.
 */
@Injectable()
export class BackgroundTasks {
  private readonly logger = new Logger(BackgroundTasks.name);
  private readonly inFlight = new Set<Promise<void>>();

  run(label: string, work: () => Promise<unknown>): void {
    const promise: Promise<void> = Promise.resolve()
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

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }
}
