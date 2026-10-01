import { NotificationChannel } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  BullMqNotificationQueue,
  NotificationQueue,
} from '../src/notifications/delivery/notification-queue';
import { ProviderRegistry } from '../src/notifications/delivery/provider-registry';
import { type MockProvider } from '../src/notifications/delivery/providers/mock.provider';
import { memberOf, setupTenant } from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

async function redisAvailable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await probe.connect();
    return (await probe.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

/** The production queue (BullMQ on Redis). Skipped when no Redis is running. */
describe('Notification queue on BullMQ (e2e)', () => {
  let ctx: TestContext | undefined;
  let available = false;

  beforeAll(async () => {
    available = await redisAvailable();
    if (!available) return;
    process.env.REDIS_URL = REDIS_URL;
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx?.app.close(); // must release every Redis connection, or jest never exits
    delete process.env.REDIS_URL;
  });

  it('retries a failed delivery through BullMQ and records it', async () => {
    if (!available || !ctx) {
      console.warn('Redis not reachable — BullMQ queue test skipped');
      return;
    }
    expect(ctx.app.get(NotificationQueue)).toBeInstanceOf(BullMqNotificationQueue);
    await resetDatabase(ctx.prisma);
    const t = await setupTenant(ctx);
    const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
    await manager.as
      .patch('/notification-preferences')
      .send({ items: [{ type: 'SYSTEM', emailEnabled: true }] })
      .expect(200);
    const email = ctx.app.get(ProviderRegistry).get(NotificationChannel.EMAIL) as MockProvider;
    email.reset();
    email.failNext(1, 'first attempt fails');

    await t.as
      .post('/notifications')
      .send({ title: 'Queue', message: 'via Redis', userIds: [manager.user.id] })
      .expect(201);

    let delivery: { status: string; attempts: number } | null = null;
    for (let i = 0; i < 100 && delivery?.status !== 'SENT'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      delivery = await ctx.prisma.notificationDelivery.findFirst({
        where: { channel: NotificationChannel.EMAIL },
        select: { status: true, attempts: true },
      });
    }
    expect(delivery).toEqual({ status: 'SENT', attempts: 2 });
    expect(email.sent).toHaveLength(1);
  });
});
