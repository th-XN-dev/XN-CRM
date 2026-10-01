import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { type DeliveryProcessor } from './delivery-processor';

/**
 * Hands deliveries to a worker outside the request lifecycle. Callers enqueue
 * only after their transaction has committed.
 */
export abstract class NotificationQueue {
  abstract enqueue(deliveryIds: string[]): Promise<void>;
  /** Backing store reachability for /health: `disabled` when no external queue is used. */
  abstract health(): Promise<'up' | 'down' | 'disabled'>;
}

const HEALTH_TIMEOUT_MS = 1_000;

const QUEUE_NAME = 'notification-deliveries';

/** Production queue: BullMQ on Redis, exponential backoff, bounded attempts. */
export class BullMqNotificationQueue extends NotificationQueue implements OnModuleDestroy {
  private readonly logger = new Logger(BullMqNotificationQueue.name);
  private readonly connection: Redis;
  /** Workers block on Redis, so they get their own connection. */
  private readonly workerConnection: Redis;
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly maxAttempts: number;

  constructor(
    redisUrl: string,
    processor: DeliveryProcessor,
    private readonly retryDelayMs: number,
  ) {
    super();
    // BullMQ workers require `maxRetriesPerRequest: null`.
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.workerConnection = this.connection.duplicate();
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const result = await processor.process((job.data as { deliveryId: string }).deliveryId);
        // Throwing hands the retry (with backoff) back to BullMQ.
        if (result.status === 'retry') throw new Error(result.error);
      },
      { connection: this.workerConnection, concurrency: 5 },
    );
    this.worker.on('error', (error) => this.logger.error(error.message));
    this.maxAttempts = processor.maxAttempts;
  }

  async enqueue(deliveryIds: string[]): Promise<void> {
    if (deliveryIds.length === 0) return;
    await this.queue.addBulk(
      deliveryIds.map((deliveryId) => ({
        name: 'deliver',
        data: { deliveryId },
        opts: {
          // One live job per delivery. Finished jobs are removed so the id frees up for a
          // manual retry; the delivery history lives in the database, not in Redis.
          jobId: deliveryId,
          attempts: this.maxAttempts,
          backoff: { type: 'exponential', delay: this.retryDelayMs },
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }

  async health(): Promise<'up' | 'down'> {
    try {
      const pong = await Promise.race([
        this.connection.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS).unref(),
        ),
      ]);
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    // BullMQ never closes connections it was given; both are ours to release.
    this.workerConnection.disconnect();
    this.connection.disconnect();
  }
}

/**
 * Development/test queue: runs deliveries in the same process after the
 * response, with the same bounded exponential retry. Not durable — the
 * scanner re-enqueues PENDING deliveries left behind by a restart.
 */
export class InlineNotificationQueue extends NotificationQueue implements OnModuleDestroy {
  private readonly timers = new Set<NodeJS.Timeout>();
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly processor: DeliveryProcessor,
    private readonly retryDelayMs: number,
  ) {
    super();
  }

  enqueue(deliveryIds: string[]): Promise<void> {
    for (const id of deliveryIds) this.schedule(id, 0);
    return Promise.resolve();
  }

  health(): Promise<'disabled'> {
    return Promise.resolve('disabled');
  }

  /** Resolves once nothing is scheduled or running (used by tests). */
  onIdle(): Promise<void> {
    if (this.running === 0 && this.timers.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.settle();
  }

  private schedule(deliveryId: string, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.running++;
      this.processor
        .process(deliveryId)
        .then((result) => {
          if (result.status === 'retry') {
            this.schedule(deliveryId, this.retryDelayMs * 2 ** (result.attempts - 1));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.settle();
        });
    }, delayMs);
    this.timers.add(timer);
  }

  private settle(): void {
    if (this.running > 0 || this.timers.size > 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
