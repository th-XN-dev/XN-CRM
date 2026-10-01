import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../../common/pagination/search';
import { parseDateOnly, todayIn } from '../../common/utils/dates';
import { PrismaService } from '../../database/prisma.service';
import { lockRows } from '../../database/row-lock';
import { FamiliesService } from '../../families/families.service';
import { StudentsService } from '../../students/students.service';
import { BranchAccessService } from '../../tenancy/branch-access.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { formatInvoiceNumber, invoiceCounterKey, nextCounter } from '../common/document-counter';
import { assertFound, dateRangeFilter, financeScope } from '../common/finance-access';
import { debtOf, type InvoiceBalance, loadBalances, netPaid } from '../common/invoice-balances';
import {
  effectiveStatus,
  InvoiceApiStatus,
  overdueWhere,
  settledStatus,
  statusWhere,
} from '../common/invoice-status';
import { type Money, money, sumMoney, ZERO } from '../common/money';
import { type CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { type CreateInvoiceDto } from './dto/create-invoice.dto';
import { type FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import { type ListInvoicesDto } from './dto/list-invoices.dto';
import { type UpdateInvoiceDto } from './dto/update-invoice.dto';

export const INVOICE_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  familyId: true,
  studentId: true,
  invoiceNumber: true,
  issueDate: true,
  dueDate: true,
  amount: true,
  discount: true,
  finalAmount: true,
  status: true,
  description: true,
  createdById: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InvoiceSelect;

const INVOICE_LIST_SELECT = {
  ...INVOICE_SELECT,
  family: { select: { id: true, name: true } },
  student: { select: { id: true, firstName: true, lastName: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceSelect;

export type InvoiceRecord = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
    private readonly families: FamiliesService,
    private readonly students: StudentsService,
  ) {}

  async create(tenant: TenantContext, dto: CreateInvoiceDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    await this.assertPayer(tenant, dto.familyId, dto.studentId);

    const amount = money(dto.amount);
    const discount = money(dto.discount);
    assertDiscount(amount, discount);
    const finalAmount = amount.minus(discount);

    const issueDate = dto.issueDate ? parseDateOnly(dto.issueDate) : todayIn(tenant.timezone);
    const dueDate = parseDateOnly(dto.dueDate);
    assertDueDate(issueDate, dueDate);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const year = issueDate.getUTCFullYear();
      const sequence = await nextCounter(tx, tenant.organizationId, invoiceCounterKey(year));
      return tx.invoice.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          familyId: dto.familyId,
          studentId: dto.studentId,
          invoiceNumber: formatInvoiceNumber(year, sequence),
          issueDate,
          dueDate,
          amount,
          discount,
          finalAmount,
          // A fully discounted invoice is settled from the start.
          status: settledStatus(finalAmount, ZERO),
          description: dto.description,
          createdById: tenant.userId,
        },
        select: INVOICE_LIST_SELECT,
      });
    });

    this.events.publish(tenant, {
      name: DomainEventName.INVOICE_CREATED,
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: {
        branchId,
        familyId: invoice.familyId,
        studentId: invoice.studentId,
        invoiceNumber: invoice.invoiceNumber,
        finalAmount: invoice.finalAmount.toString(),
      },
    });
    return present(invoice, emptyBalance(), todayIn(tenant.timezone));
  }

  async list(tenant: TenantContext, query: ListInvoicesDto) {
    const today = todayIn(tenant.timezone);
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        financeScope(tenant, query.branchId),
        {
          familyId: query.familyId,
          studentId: query.studentId,
          issueDate: dateRangeFilter(query),
        },
        statusWhere(query.status, today),
        overdueWhere(query.overdue, today),
        searchWhere<Prisma.InvoiceWhereInput>(query.search, (term) => [
          { invoiceNumber: icontains(term) },
          { description: icontains(term) },
          { family: { name: icontains(term) } },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: INVOICE_LIST_SELECT,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const balances = await loadBalances(
      this.prisma,
      items.map((item) => item.id),
    );
    return new Paginated(
      items.map((item) => present(item, balances.get(item.id)!, today)),
      total,
      query,
    );
  }

  async findOne(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      select: {
        ...INVOICE_LIST_SELECT,
        payments: {
          orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            amount: true,
            method: true,
            paymentDate: true,
            cashierId: true,
            transactionId: true,
            note: true,
            createdAt: true,
          },
        },
        refunds: {
          orderBy: { refundedAt: 'asc' },
          select: {
            id: true,
            paymentId: true,
            amount: true,
            reason: true,
            refundedById: true,
            refundedAt: true,
          },
        },
      },
    });
    const balance: InvoiceBalance = {
      paid: sumMoney(invoice.payments.map((payment) => payment.amount)),
      refunded: sumMoney(invoice.refunds.map((refund) => refund.amount)),
    };
    return present(invoice, balance, todayIn(tenant.timezone));
  }

  async update(tenant: TenantContext, id: string, dto: UpdateInvoiceDto) {
    assertNotCancelled(await this.getAccessible(tenant, id));

    const { invoice, balance } = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockWithinTx(tx, tenant, id);
      const amount = dto.amount !== undefined ? money(dto.amount) : current.amount;
      const discount = dto.discount !== undefined ? money(dto.discount) : current.discount;
      assertDiscount(amount, discount);
      const finalAmount = amount.minus(discount);
      const dueDate = dto.dueDate ? parseDateOnly(dto.dueDate) : current.dueDate;
      assertDueDate(current.issueDate, dueDate);

      const balance = (await loadBalances(tx, [id])).get(id)!;
      const net = netPaid(balance);
      if (finalAmount.lt(net)) {
        throw AppException.conflict(
          ErrorCode.INVOICE_AMOUNT_BELOW_PAID,
          `Final amount cannot be below the amount already paid (${net.toString()})`,
        );
      }
      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          amount,
          discount,
          finalAmount,
          dueDate,
          description: dto.description,
          status: settledStatus(finalAmount, net),
        },
        select: INVOICE_LIST_SELECT,
      });
      return { invoice, balance };
    });

    this.events.publish(tenant, {
      name: DomainEventName.INVOICE_UPDATED,
      entityType: 'Invoice',
      entityId: id,
      payload: { fields: Object.keys(dto) },
    });
    return present(invoice, balance, todayIn(tenant.timezone));
  }

  /** Allowed only while no money is held for the invoice (refund payments first). */
  async cancel(tenant: TenantContext, id: string, dto: CancelInvoiceDto) {
    assertNotCancelled(await this.getAccessible(tenant, id));

    const { invoice, balance } = await this.prisma.$transaction(async (tx) => {
      await this.lockWithinTx(tx, tenant, id);
      const balance = (await loadBalances(tx, [id])).get(id)!;
      if (netPaid(balance).gt(ZERO)) {
        throw AppException.conflict(
          ErrorCode.INVOICE_HAS_PAYMENTS,
          'Invoice has payments; refund them before cancelling',
        );
      }
      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: tenant.userId,
          cancelReason: dto.reason ?? null,
        },
        select: INVOICE_LIST_SELECT,
      });
      return { invoice, balance };
    });

    this.events.publish(tenant, {
      name: DomainEventName.INVOICE_CANCELLED,
      entityType: 'Invoice',
      entityId: id,
      payload: { reason: dto.reason ?? null },
    });
    return present(invoice, balance, todayIn(tenant.timezone));
  }

  /** Billed / paid / debt totals for a family or a student (non-cancelled invoices). */
  async summary(tenant: TenantContext, query: FinanceSummaryQueryDto) {
    if (!query.familyId && !query.studentId) {
      throw AppException.badRequest(ErrorCode.BAD_REQUEST, 'familyId or studentId is required');
    }
    if (query.familyId) await this.families.getAccessible(tenant, query.familyId);
    if (query.studentId) await this.students.getAccessible(tenant, query.studentId);

    const today = todayIn(tenant.timezone);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...financeScope(tenant, query.branchId),
        familyId: query.familyId,
        studentId: query.studentId,
        status: { not: InvoiceStatus.CANCELLED },
      },
      select: { id: true, finalAmount: true, status: true, dueDate: true },
    });
    const balances = await loadBalances(
      this.prisma,
      invoices.map((invoice) => invoice.id),
    );

    let paid = ZERO;
    let refunded = ZERO;
    let debt = ZERO;
    let overdueCount = 0;
    for (const invoice of invoices) {
      const balance = balances.get(invoice.id)!;
      paid = paid.plus(balance.paid);
      refunded = refunded.plus(balance.refunded);
      debt = debt.plus(debtOf(invoice.finalAmount, balance));
      if (effectiveStatus(invoice.status, invoice.dueDate, today) === InvoiceApiStatus.OVERDUE) {
        overdueCount++;
      }
    }
    return {
      familyId: query.familyId ?? null,
      studentId: query.studentId ?? null,
      billed: sumMoney(invoices.map((invoice) => invoice.finalAmount)),
      paid,
      refunded,
      debt,
      invoiceCount: invoices.length,
      overdueCount,
    };
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<InvoiceRecord> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: INVOICE_SELECT,
    });
    return assertFound(tenant, invoice, ErrorCode.INVOICE_NOT_FOUND, 'Invoice');
  }

  // ─── used by payments/refunds (inside their transaction) ────────────────────

  /** `FOR UPDATE` on the invoice, then its fresh state; rejects cancelled invoices. */
  async lockWithinTx(tx: Tx, tenant: TenantContext, id: string): Promise<InvoiceRecord> {
    const [locked] = await lockRows(tx, 'invoices', [id], tenant.organizationId);
    if (!locked) throw AppException.notFound(ErrorCode.INVOICE_NOT_FOUND, 'Invoice not found');
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: INVOICE_SELECT });
    assertNotCancelled(invoice);
    return invoice;
  }

  /** Re-derives the stored status from payment/refund history. */
  async settleWithinTx(
    tx: Tx,
    invoice: { id: string; finalAmount: Money },
  ): Promise<InvoiceStatus> {
    const balance = (await loadBalances(tx, [invoice.id])).get(invoice.id)!;
    const status = settledStatus(invoice.finalAmount, netPaid(balance));
    await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    return status;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async assertPayer(
    tenant: TenantContext,
    familyId: string,
    studentId?: string,
  ): Promise<void> {
    const family = await this.families.getAccessible(tenant, familyId);
    if (!family.isActive) {
      throw AppException.conflict(ErrorCode.FAMILY_INACTIVE, 'Family is inactive');
    }
    if (studentId) {
      const student = await this.students.getAccessible(tenant, studentId);
      if (student.familyId !== familyId) {
        throw AppException.badRequest(
          ErrorCode.STUDENT_NOT_IN_FAMILY,
          'Student does not belong to this family',
        );
      }
    }
  }
}

function present<T extends InvoiceRecord>(invoice: T, balance: InvoiceBalance, today: Date) {
  const cancelled = invoice.status === InvoiceStatus.CANCELLED;
  return {
    ...invoice,
    paid: balance.paid,
    refunded: balance.refunded,
    debt: cancelled ? ZERO : debtOf(invoice.finalAmount, balance),
    status: effectiveStatus(invoice.status, invoice.dueDate, today),
  };
}

const emptyBalance = (): InvoiceBalance => ({ paid: ZERO, refunded: ZERO });

function assertNotCancelled(invoice: { status: InvoiceStatus }): void {
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw AppException.conflict(ErrorCode.INVOICE_CANCELLED, 'Invoice is cancelled');
  }
}

function assertDiscount(amount: Money, discount: Money): void {
  if (discount.gt(amount)) {
    throw AppException.badRequest(ErrorCode.INVALID_DISCOUNT, 'Discount cannot exceed the amount');
  }
}

function assertDueDate(issueDate: Date, dueDate: Date): void {
  if (dueDate < issueDate) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      'dueDate must not be before issueDate',
    );
  }
}
