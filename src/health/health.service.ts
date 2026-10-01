import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationQueue } from '../notifications/delivery/notification-queue';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type Check = 'up' | 'down' | 'disabled';

export interface HealthReport {
  status: HealthStatus;
  checks: { api: 'up'; database: Check; redis: Check };
  uptimeSeconds: number;
}

const DB_TIMEOUT_MS = 2_000;

/**
 * healthy   → everything up;
 * degraded  → serving requests, but Redis (notification delivery) is down;
 * unhealthy → the database is unreachable.
 * Only up/down flags are exposed — never hosts, versions or error texts.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueue,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.database(), this.queue.health()]);
    const status: HealthStatus =
      database === 'down' ? 'unhealthy' : redis === 'down' ? 'degraded' : 'healthy';
    return {
      status,
      checks: { api: 'up', database, redis },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async database(): Promise<'up' | 'down'> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS).unref(),
        ),
      ]);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
