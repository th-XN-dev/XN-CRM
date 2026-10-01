import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CenterStatus } from '@prisma/client';
import { todayIn } from '../common/utils/dates';
import { type EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../database/prisma.service';
import { ChecklistsService } from './checklists.service';

/**
 * Creates every center's checklist items for its own "today" (each center
 * has its timezone). Runs on start and then periodically; opening the
 * checklist creates today's items too, so a missed tick never loses a day.
 */
@Injectable()
export class ChecklistSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ChecklistSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checklists: ChecklistsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('CHECKLIST_SCAN_INTERVAL_MS', { infer: true });
    if (interval <= 0) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One pass over active centers; returns how many items were created. */
  async generateToday(now = new Date()): Promise<number> {
    const centers = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        status: CenterStatus.ACTIVE,
        checklistTemplates: { some: { isActive: true } },
      },
      select: { id: true, timezone: true },
    });
    let created = 0;
    for (const center of centers) {
      created += await this.checklists.ensureDay(
        center.id,
        center.timezone,
        todayIn(center.timezone, now),
      );
    }
    return created;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.generateToday();
    } catch (error) {
      this.logger.error(`Checklist generation failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
