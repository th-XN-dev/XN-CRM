import { type ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { type EnvironmentVariables } from '../../config/env.validation';
import { type PrismaService } from '../../database/prisma.service';
import { type NotificationTemplatesService } from '../templates/notification-templates.service';
import { DeliveryProcessor } from './delivery-processor';
import { InlineNotificationQueue } from './notification-queue';
import { ProviderRegistry } from './provider-registry';
import { MockProvider } from './providers/mock.provider';

type Row = {
  id: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attempts: number;
  errorMessage?: string | null;
  provider?: string | null;
  failedAt?: Date | null;
  sentAt?: Date | null;
};

function setup(maxAttempts = 3, contact = { email: 'a@test.uz', phone: null }) {
  const row: Row = {
    id: 'd1',
    channel: NotificationChannel.EMAIL,
    status: NotificationDeliveryStatus.PENDING,
    attempts: 0,
  };
  const prisma = {
    notificationDelivery: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          ...row,
          notification: {
            id: 'n1',
            organizationId: 'o1',
            type: NotificationType.SYSTEM,
            data: { title: 'T', message: 'M' },
            recipient: { ...contact, telegramAccount: null },
          },
        }),
      ),
      update: jest.fn(({ data }: { data: Partial<Row> }) => {
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
  } as unknown as PrismaService;
  const templates = {
    render: jest.fn(() => Promise.resolve({ title: 'T', message: 'M' })),
  } as unknown as NotificationTemplatesService;
  const config = {
    get: () => maxAttempts,
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const email = new MockProvider(NotificationChannel.EMAIL, 'mock-email');
  const processor = new DeliveryProcessor(prisma, new ProviderRegistry([email]), templates, config);
  return { row, email, processor };
}

describe('DeliveryProcessor', () => {
  it('sends and records SENT', async () => {
    const { row, email, processor } = setup();
    await expect(processor.process('d1')).resolves.toEqual({ status: 'done' });
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, provider: 'mock-email' });
    expect(email.sent).toEqual([
      { to: 'a@test.uz', title: 'T', message: 'M', notificationId: 'n1' },
    ]);
  });

  it('asks for a retry below the cap, then FAILED with the error at the cap', async () => {
    const { row, email, processor } = setup(3);
    email.failNext(Infinity, 'SMTP down');

    await expect(processor.process('d1')).resolves.toMatchObject({ status: 'retry', attempts: 1 });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, errorMessage: 'SMTP down' });
    await expect(processor.process('d1')).resolves.toMatchObject({ status: 'retry', attempts: 2 });
    await expect(processor.process('d1')).resolves.toEqual({ status: 'done' });
    expect(row).toMatchObject({ status: 'FAILED', attempts: 3, errorMessage: 'SMTP down' });
    expect(row.failedAt).toBeInstanceOf(Date);

    // Finished deliveries are never processed again.
    await expect(processor.process('d1')).resolves.toEqual({ status: 'done' });
    expect(row.attempts).toBe(3);
  });

  it('cancels when the recipient has no address, fails when no provider exists', async () => {
    const noEmail = setup(3, { email: null as unknown as string, phone: null });
    await noEmail.processor.process('d1');
    expect(noEmail.row).toMatchObject({ status: 'CANCELLED' });

    const noProvider = setup();
    noProvider.row.channel = NotificationChannel.SMS;
    await noProvider.processor.process('d1');
    expect(noProvider.row).toMatchObject({
      status: 'FAILED',
      errorMessage: 'No provider configured for SMS',
    });
  });
});

describe('InlineNotificationQueue', () => {
  it('retries with backoff until the processor says done, never more', async () => {
    const results = [
      { status: 'retry' as const, attempts: 1, error: 'x' },
      { status: 'retry' as const, attempts: 2, error: 'x' },
      { status: 'done' as const },
    ];
    const process = jest.fn(() => Promise.resolve(results.shift() ?? { status: 'done' as const }));
    const queue = new InlineNotificationQueue({ process } as unknown as DeliveryProcessor, 1);

    await queue.enqueue(['d1']);
    await queue.onIdle();
    expect(process).toHaveBeenCalledTimes(3);
  });

  it('end to end with the real processor: 2 failures then success', async () => {
    const { row, email, processor } = setup(3);
    email.failNext(2);
    const queue = new InlineNotificationQueue(processor, 1);
    await queue.enqueue(['d1']);
    await queue.onIdle();
    expect(row).toMatchObject({ status: 'SENT', attempts: 3 });
    expect(email.sent).toHaveLength(1);
  });
});
