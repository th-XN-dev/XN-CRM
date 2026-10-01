import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvoiceStatus,
  LeadStatus,
  NotificationDeliveryStatus,
  NotificationType,
  TaskStatus,
} from '@prisma/client';
import { todayIn } from '../../common/utils/dates';
import { type EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import { debtOf, loadBalances } from '../../finance/common/invoice-balances';
import { formatDate, formatDateTime, formatMoney, personName } from '../core/formatters';
import { NotificationQueue } from '../delivery/notification-queue';
import { NotificationsService, type NotifyResult } from '../notifications.service';

const BATCH = 500;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A PENDING delivery untouched this long is considered lost (e.g. process restart). */
const STALE_PENDING_MS = 5 * 60_000;

/**
 * Time-based reminders (due soon / overdue / follow-up) and recovery of lost
 * deliveries. Safe to run from several instances: every reminder has an
 * idempotency key tied to the item and its deadline, so a changed deadline
 * produces a new reminder and an unchanged one never repeats.
 */
@Injectable()
export class NotificationScannerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationScannerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly queue: NotificationQueue,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('NOTIFICATION_SCAN_INTERVAL_MS', { infer: true });
    if (interval <= 0) return;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One full pass; returns how many notifications were created. */
  async scan(now = new Date()): Promise<NotifyResult> {
    const totals: NotifyResult = { created: 0, duplicates: 0 };
    const add = (result: NotifyResult) => {
      totals.created += result.created;
      totals.duplicates += result.duplicates;
    };
    await this.recoverPending(now);
    for (const result of await this.scanTasks(now)) add(result);
    for (const result of await this.scanLeads(now)) add(result);
    for (const result of await this.scanInvoices(now)) add(result);
    return totals;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scan();
    } catch (error) {
      this.logger.error(`Notification scan failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async recoverPending(now: Date): Promise<void> {
    const stale = await this.prisma.notificationDelivery.findMany({
      where: {
        status: NotificationDeliveryStatus.PENDING,
        updatedAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) },
      },
      select: { id: true },
      take: BATCH,
    });
    await this.queue.enqueue(stale.map((row) => row.id));
  }

  private async scanTasks(now: Date): Promise<NotifyResult[]> {
    const dueHours = this.config.get('NOTIFICATION_TASK_DUE_HOURS', { infer: true });
    const lookback = this.lookbackMs();
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        assignedTo: { userId: { not: null } },
        dueDate: {
          gte: new Date(now.getTime() - lookback),
          lte: new Date(now.getTime() + dueHours * HOUR),
        },
      },
      orderBy: { dueDate: 'desc' },
      take: BATCH,
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        title: true,
        dueDate: true,
        priority: true,
        assignedTo: { select: { userId: true } },
        branch: { select: { name: true } },
        organization: { select: { timezone: true } },
      },
    });
    const results: NotifyResult[] = [];
    for (const task of tasks) {
      const dueDate = task.dueDate!;
      const type = dueDate <= now ? NotificationType.TASK_OVERDUE : NotificationType.TASK_DUE;
      results.push(
        await this.notifications.notify({
          organizationId: task.organizationId,
          branchId: task.branchId,
          type,
          eventKey: `${type}:${task.id}:${dueDate.toISOString()}`,
          subjectUserIds: [task.assignedTo?.userId],
          relatedType: 'Task',
          relatedId: task.id,
          variables: {
            taskTitle: task.title,
            dueDate: formatDateTime(dueDate, task.organization.timezone),
            priority: task.priority,
            branchName: task.branch.name,
          },
        }),
      );
    }
    return results;
  }

  private async scanLeads(now: Date): Promise<NotifyResult[]> {
    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        assignedToId: { not: null },
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] },
        nextFollowUpAt: { gte: new Date(now.getTime() - this.lookbackMs()), lte: now },
      },
      orderBy: { nextFollowUpAt: 'desc' },
      take: BATCH,
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        name: true,
        phone: true,
        assignedToId: true,
        nextFollowUpAt: true,
        branch: { select: { name: true } },
        organization: { select: { timezone: true } },
      },
    });
    const results: NotifyResult[] = [];
    for (const lead of leads) {
      const followUpAt = lead.nextFollowUpAt!;
      results.push(
        await this.notifications.notify({
          organizationId: lead.organizationId,
          branchId: lead.branchId,
          type: NotificationType.LEAD_FOLLOW_UP,
          eventKey: `LEAD_FOLLOW_UP:${lead.id}:${followUpAt.toISOString()}`,
          subjectUserIds: [lead.assignedToId],
          relatedType: 'Lead',
          relatedId: lead.id,
          variables: {
            leadName: lead.name,
            leadPhone: lead.phone,
            followUpAt: formatDateTime(followUpAt, lead.organization.timezone),
            branchName: lead.branch.name,
          },
        }),
      );
    }
    return results;
  }

  /** Per organization, because "today" depends on the organization's timezone. */
  private async scanInvoices(now: Date): Promise<NotifyResult[]> {
    const dueDays = this.config.get('NOTIFICATION_PAYMENT_DUE_DAYS', { infer: true });
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, timezone: true },
    });
    const results: NotifyResult[] = [];
    for (const organization of organizations) {
      const today = todayIn(organization.timezone, now);
      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId: organization.id,
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
          dueDate: {
            gte: new Date(today.getTime() - this.lookbackMs()),
            lte: new Date(today.getTime() + dueDays * DAY),
          },
        },
        orderBy: { dueDate: 'desc' },
        take: BATCH,
        select: {
          id: true,
          branchId: true,
          invoiceNumber: true,
          dueDate: true,
          finalAmount: true,
          family: { select: { name: true } },
          student: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
        },
      });
      const balances = await loadBalances(
        this.prisma,
        invoices.map((invoice) => invoice.id),
      );
      for (const invoice of invoices) {
        const type =
          invoice.dueDate < today ? NotificationType.PAYMENT_OVERDUE : NotificationType.PAYMENT_DUE;
        results.push(
          await this.notifications.notify({
            organizationId: organization.id,
            branchId: invoice.branchId,
            type,
            eventKey: `${type}:${invoice.id}:${formatDate(invoice.dueDate)}`,
            relatedType: 'Invoice',
            relatedId: invoice.id,
            variables: {
              familyName: invoice.family.name,
              studentName: invoice.student ? personName(invoice.student) : '—',
              amount: formatMoney(debtOf(invoice.finalAmount, balances.get(invoice.id)!)),
              invoiceNumber: invoice.invoiceNumber,
              dueDate: formatDate(invoice.dueDate),
              branchName: invoice.branch.name,
            },
          }),
        );
      }
    }
    return results;
  }

  private lookbackMs(): number {
    return this.config.get('NOTIFICATION_OVERDUE_LOOKBACK_DAYS', { infer: true }) * DAY;
  }
}
