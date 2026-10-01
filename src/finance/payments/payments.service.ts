import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { parseDateOnly, todayIn } from '../../common/utils/dates';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import {
  assertFound,
  dateRangeFilter,
  dayRangeFilter,
  financeScope,
} from '../common/finance-access';
import { debtOf, loadBalances } from '../common/invoice-balances';
import { money, sumMoney } from '../common/money';
import { InvoicesService } from '../invoices/invoices.service';
import {
  type CreatePaymentDto,
  type CreateRefundDto,
  type ListPaymentsDto,
  type ListRefundsDto,
} from './dto/payment.dto';

const PAYMENT_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  invoiceId: true,
  familyId: true,
  studentId: true,
  amount: true,
  method: true,
  paymentDate: true,
  cashierId: true,
  cashSessionId: true,
  transactionId: true,
  note: true,
  createdAt: true,
  invoice: { select: { id: true, invoiceNumber: true } },
  family: { select: { id: true, name: true } },
  cashier: { select: { id: true, name: true } },
} satisfies Prisma.PaymentSelect;

const REFUND_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  paymentId: true,
  invoiceId: true,
  amount: true,
  reason: true,
  refundedById: true,
  refundedAt: true,
  cashSessionId: true,
  createdAt: true,
} satisfies Prisma.RefundSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
    private readonly invoices: InvoicesService,
    private readonly cashSessions: CashSessionsService,
  ) {}

  /**
   * Receives money against an invoice. Under the invoice lock: the invoice must
   * be open, the amount must not exceed the remaining debt, and CASH must go
   * into the cashier's open drawer in the invoice's branch.
   */
  async create(tenant: TenantContext, dto: CreatePaymentDto) {
    const invoice = await this.invoices.getAccessible(tenant, dto.invoiceId);

    const today = todayIn(tenant.timezone);
    const paymentDate = dto.paymentDate ? parseDateOnly(dto.paymentDate) : today;
    if (paymentDate > today) {
      throw AppException.badRequest(
        ErrorCode.PAYMENT_DATE_IN_FUTURE,
        'paymentDate cannot be in the future',
      );
    }

    const transactionId = dto.transactionId ?? randomUUID();
    if (dto.transactionId) {
      const existing = await this.findByTransactionId(tenant, transactionId);
      if (existing) throw alreadyExists(existing);
    }
    const amount = money(dto.amount);

    let result: { payment: PaymentRecord; invoiceStatus: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const fresh = await this.invoices.lockWithinTx(tx, tenant, invoice.id);
        const balance = (await loadBalances(tx, [fresh.id])).get(fresh.id)!;
        const remaining = debtOf(fresh.finalAmount, balance);
        if (amount.gt(remaining)) {
          throw AppException.conflict(
            ErrorCode.PAYMENT_EXCEEDS_BALANCE,
            `Payment exceeds the remaining balance (${remaining.toString()})`,
          );
        }
        const cashSessionId =
          dto.method === PaymentMethod.CASH
            ? await this.cashSessions.requireOpenWithinTx(tx, tenant, fresh.branchId)
            : null;

        const payment = await tx.payment.create({
          data: {
            organizationId: tenant.organizationId,
            branchId: fresh.branchId,
            invoiceId: fresh.id,
            familyId: fresh.familyId,
            studentId: fresh.studentId,
            amount,
            method: dto.method,
            paymentDate,
            cashierId: tenant.userId,
            cashSessionId,
            transactionId,
            note: dto.note,
          },
          select: PAYMENT_SELECT,
        });
        const invoiceStatus = await this.invoices.settleWithinTx(tx, fresh);
        return { payment, invoiceStatus };
      });
    } catch (error) {
      // Same idempotency key sent concurrently: the unique index decides.
      if (isUniqueViolation(error)) {
        throw alreadyExists(await this.findByTransactionId(tenant, transactionId));
      }
      throw error;
    }

    const { payment, invoiceStatus } = result;
    this.events.publish(tenant, {
      name: DomainEventName.PAYMENT_CREATED,
      entityType: 'Payment',
      entityId: payment.id,
      payload: {
        invoiceId: payment.invoiceId,
        branchId: payment.branchId,
        amount: payment.amount.toString(),
        method: payment.method,
        invoiceStatus,
      },
    });
    return { ...payment, refunded: money(0) };
  }

  /** Returns (part of) a payment. The payment stays; the invoice debt re-opens. */
  async refund(tenant: TenantContext, paymentId: string, dto: CreateRefundDto) {
    const payment = await this.getAccessible(tenant, paymentId);
    const amount = money(dto.amount);

    const { refund, invoiceStatus } = await this.prisma.$transaction(async (tx) => {
      // Lock order: invoices → cash_sessions.
      const invoice = await this.invoices.lockWithinTx(tx, tenant, payment.invoiceId);
      const refunded = await tx.refund.aggregate({
        where: { paymentId },
        _sum: { amount: true },
      });
      const refundable = payment.amount.minus(money(refunded._sum.amount));
      if (amount.gt(refundable)) {
        throw AppException.conflict(
          ErrorCode.REFUND_EXCEEDS_PAYMENT,
          `Refund exceeds the refundable amount (${refundable.toString()})`,
        );
      }
      // Cash leaves the refunder's drawer.
      const cashSessionId =
        payment.method === PaymentMethod.CASH
          ? await this.cashSessions.requireOpenWithinTx(tx, tenant, payment.branchId)
          : null;

      const refund = await tx.refund.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: payment.branchId,
          paymentId,
          invoiceId: payment.invoiceId,
          amount,
          reason: dto.reason,
          refundedById: tenant.userId,
          cashSessionId,
        },
        select: REFUND_SELECT,
      });
      const invoiceStatus = await this.invoices.settleWithinTx(tx, invoice);
      return { refund, invoiceStatus };
    });

    this.events.publish(tenant, {
      name: DomainEventName.REFUND_CREATED,
      entityType: 'Refund',
      entityId: refund.id,
      payload: {
        paymentId,
        invoiceId: refund.invoiceId,
        amount: refund.amount.toString(),
        invoiceStatus,
      },
    });
    return refund;
  }

  async list(tenant: TenantContext, query: ListPaymentsDto) {
    const where: Prisma.PaymentWhereInput = {
      ...financeScope(tenant, query.branchId),
      invoiceId: query.invoiceId,
      familyId: query.familyId,
      studentId: query.studentId,
      cashierId: query.cashierId,
      cashSessionId: query.cashSessionId,
      method: query.method,
      paymentDate: dateRangeFilter(query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paymentDate: query.sortOrder }, { createdAt: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: PAYMENT_SELECT,
      }),
      this.prisma.payment.count({ where }),
    ]);
    const refunded = await this.refundedTotals(items.map((item) => item.id));
    return new Paginated(
      items.map((item) => ({ ...item, refunded: refunded.get(item.id) ?? money(0) })),
      total,
      query,
    );
  }

  /** Newest first; the refund's family is its invoice's family. */
  async listRefunds(tenant: TenantContext, query: ListRefundsDto) {
    const where: Prisma.RefundWhereInput = {
      ...financeScope(tenant, query.branchId),
      paymentId: query.paymentId,
      invoice: query.familyId ? { familyId: query.familyId } : undefined,
      refundedAt: dayRangeFilter(query, tenant.timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where,
        orderBy: [{ refundedAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
        select: {
          ...REFUND_SELECT,
          payment: { select: { id: true, amount: true, method: true, paymentDate: true } },
          invoice: {
            select: { id: true, invoiceNumber: true, family: { select: { id: true, name: true } } },
          },
          refundedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.refund.count({ where }),
    ]);
    return new Paginated(
      items.map(({ invoice: { family, ...invoice }, ...refund }) => ({
        ...refund,
        invoice,
        family,
      })),
      total,
      query,
    );
  }

  async findOne(tenant: TenantContext, id: string) {
    const payment = await this.getAccessible(tenant, id);
    const refunds = await this.prisma.refund.findMany({
      where: { paymentId: id },
      orderBy: { refundedAt: 'asc' },
      select: REFUND_SELECT,
    });
    return {
      ...payment,
      refunded: sumMoney(refunds.map((refund) => refund.amount)),
      refunds,
    };
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<PaymentRecord> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: PAYMENT_SELECT,
    });
    return assertFound(tenant, payment, ErrorCode.PAYMENT_NOT_FOUND, 'Payment');
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private findByTransactionId(tenant: TenantContext, transactionId: string) {
    return this.prisma.payment.findUnique({
      where: {
        organizationId_transactionId: { organizationId: tenant.organizationId, transactionId },
      },
      select: PAYMENT_SELECT,
    });
  }

  private async refundedTotals(paymentIds: string[]) {
    const totals = new Map<string, Prisma.Decimal>();
    if (paymentIds.length === 0) return totals;
    const rows = await this.prisma.refund.groupBy({
      by: ['paymentId'],
      where: { paymentId: { in: paymentIds } },
      _sum: { amount: true },
    });
    for (const row of rows) totals.set(row.paymentId, money(row._sum.amount));
    return totals;
  }
}

function alreadyExists(existing: PaymentRecord | null): AppException {
  return new AppException(
    ErrorCode.PAYMENT_ALREADY_EXISTS,
    'A payment with this transactionId already exists',
    HttpStatus.CONFLICT,
    existing ?? undefined,
  );
}
