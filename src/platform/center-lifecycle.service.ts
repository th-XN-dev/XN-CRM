import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CenterStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../database/prisma.service';
import { centerAvailability, CENTER_LIFECYCLE_SELECT } from './center-availability';

/**
 * Freezes centers whose activation period has ended. Access is already
 * refused at request time (TenantGuard checks the period on every request);
 * this sweep makes the stored status say so too, with an audit row
 * (CENTER_EXPIRED, actor = system). Idempotent, safe on several instances.
 */
@Injectable()
export class CenterLifecycleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CenterLifecycleService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('CENTER_EXPIRY_SCAN_INTERVAL_MS', { infer: true });
    if (interval <= 0) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One pass; returns the ids of the centers it froze. */
  async freezeExpired(now = new Date()): Promise<string[]> {
    const candidates = await this.prisma.organization.findMany({
      where: { deletedAt: null, status: CenterStatus.ACTIVE, activeUntil: { not: null } },
      select: { id: true, ...CENTER_LIFECYCLE_SELECT },
    });
    const frozen: string[] = [];
    for (const center of candidates) {
      if (centerAvailability(center, now) !== 'EXPIRED') continue;
      // Compare-and-set: a concurrent sweep or an owner action wins cleanly.
      const { count } = await this.prisma.organization.updateMany({
        where: { id: center.id, status: CenterStatus.ACTIVE, activeUntil: center.activeUntil },
        data: { status: CenterStatus.FROZEN, statusChangedAt: now },
      });
      if (count === 0) continue;
      frozen.push(center.id);
      await this.audit.record({
        organizationId: center.id,
        userId: null,
        action: 'CENTER_EXPIRED',
        entityType: 'Center',
        entityId: center.id,
        oldData: { status: CenterStatus.ACTIVE },
        newData: { status: CenterStatus.FROZEN, activeUntil: center.activeUntil },
      });
    }
    return frozen;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const frozen = await this.freezeExpired();
      if (frozen.length) this.logger.log(`Froze ${frozen.length} expired center(s)`);
    } catch (error) {
      this.logger.error(`Center expiry sweep failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
