import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { type DomainEvent, DomainEventName } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { formatDate, formatMoney, personName } from '../core/formatters';
import { NotificationsService } from '../notifications.service';
import { NotificationActivity } from './notification-activity';

/**
 * payment.created → PAYMENT_RECEIVED. Runs after the payment transaction has
 * committed (domain events are post-commit); external channels only get queued.
 */
@Injectable()
export class FinanceNotificationsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: NotificationActivity,
  ) {}

  @OnEvent(DomainEventName.PAYMENT_CREATED)
  onPayment(event: DomainEvent): void {
    this.activity.run('payment.created', () => this.paymentReceived(event));
  }

  private async paymentReceived(event: DomainEvent): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: event.entityId, organizationId: event.organizationId },
      select: {
        id: true,
        branchId: true,
        amount: true,
        method: true,
        invoice: {
          select: { invoiceNumber: true, dueDate: true, branch: { select: { name: true } } },
        },
        family: { select: { name: true } },
        student: { select: { firstName: true, lastName: true } },
        cashier: { select: { name: true } },
      },
    });
    if (!payment) return;

    await this.notifications.notify({
      organizationId: event.organizationId,
      branchId: payment.branchId,
      type: NotificationType.PAYMENT_RECEIVED,
      // One notification per payment, however often the event is replayed.
      eventKey: `PAYMENT_RECEIVED:${payment.id}`,
      actorUserId: event.actorUserId,
      relatedType: 'Payment',
      relatedId: payment.id,
      variables: {
        familyName: payment.family.name,
        studentName: payment.student ? personName(payment.student) : '—',
        amount: formatMoney(payment.amount),
        invoiceNumber: payment.invoice.invoiceNumber,
        dueDate: formatDate(payment.invoice.dueDate),
        branchName: payment.invoice.branch.name,
        paymentMethod: payment.method,
        cashierName: payment.cashier.name,
      },
    });
  }
}
