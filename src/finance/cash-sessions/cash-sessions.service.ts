import { Injectable } from '@nestjs/common';
import { CashSessionStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { lockRows } from '../../database/row-lock';
import { BranchAccessService } from '../../tenancy/branch-access.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { assertFound, dayRangeFilter, financeScope } from '../common/finance-access';
import { type Money, money } from '../common/money';
import {
  type CloseCashSessionDto,
  type ListCashSessionsDto,
  type OpenCashSessionDto,
} from './dto/cash-session.dto';

const SESSION_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  cashierId: true,
  status: true,
  openedAt: true,
  closedAt: true,
  openingBalance: true,
  expectedBalance: true,
  closingBalance: true,
  difference: true,
  note: true,
  cashier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CashSessionSelect;

type SessionRecord = Prisma.CashSessionGetPayload<{ select: typeof SESSION_SELECT }>;
type Db = Pick<Prisma.TransactionClient, 'payment' | 'refund' | 'expense'>;
type Tx = Prisma.TransactionClient;

export interface CashSessionTotals {
  cashIn: Money;
  refundsOut: Money;
  expensesOut: Money;
  expectedBalance: Money;
  paymentCount: number;
}

@Injectable()
export class CashSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** Opens the caller's drawer. One OPEN session per cashier per organization. */
  async open(tenant: TenantContext, dto: OpenCashSessionDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    const existing = await this.findOpenOf(tenant, tenant.userId);
    if (existing) throw alreadyOpen(existing.id);

    let session: SessionRecord;
    try {
      session = await this.prisma.cashSession.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          cashierId: tenant.userId,
          openingBalance: money(dto.openingBalance),
          note: dto.note,
        },
        select: SESSION_SELECT,
      });
    } catch (error) {
      // Backstop: partial unique index `cash_sessions_one_open_per_cashier`.
      if (isUniqueViolation(error)) throw alreadyOpen();
      throw error;
    }

    this.events.publish(tenant, {
      name: DomainEventName.CASH_SESSION_OPENED,
      entityType: 'CashSession',
      entityId: session.id,
      payload: { branchId, openingBalance: session.openingBalance.toString() },
    });
    return this.withTotals(this.prisma, session);
  }

  /** Counts the drawer and closes it; `difference` = counted − expected. Owner only. */
  async close(tenant: TenantContext, id: string, dto: CloseCashSessionDto) {
    const current = await this.getAccessible(tenant, id);
    assertOwner(tenant, current);
    assertOpen(current);

    const session = await this.prisma.$transaction(async (tx) => {
      await lockRows(tx, 'cash_sessions', [id], tenant.organizationId);
      const fresh = await tx.cashSession.findUniqueOrThrow({
        where: { id },
        select: SESSION_SELECT,
      });
      assertOpen(fresh);

      const totals = await computeTotals(tx, fresh);
      const closingBalance = money(dto.closingBalance);
      return tx.cashSession.update({
        where: { id },
        data: {
          status: CashSessionStatus.CLOSED,
          closedAt: new Date(),
          expectedBalance: totals.expectedBalance,
          closingBalance,
          difference: closingBalance.minus(totals.expectedBalance),
          note: dto.note ?? fresh.note,
        },
        select: SESSION_SELECT,
      });
    });

    this.events.publish(tenant, {
      name: DomainEventName.CASH_SESSION_CLOSED,
      entityType: 'CashSession',
      entityId: id,
      payload: {
        branchId: session.branchId,
        expectedBalance: session.expectedBalance?.toString() ?? null,
        closingBalance: session.closingBalance?.toString() ?? null,
        difference: session.difference?.toString() ?? null,
      },
    });
    return this.withTotals(this.prisma, session);
  }

  async list(tenant: TenantContext, query: ListCashSessionsDto) {
    const where: Prisma.CashSessionWhereInput = {
      ...financeScope(tenant, query.branchId),
      cashierId: query.cashierId,
      status: query.status,
      openedAt: dayRangeFilter(query, tenant.timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        where,
        orderBy: [{ openedAt: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: SESSION_SELECT,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  /** The caller's open drawer (any branch), or `null`. */
  async current(tenant: TenantContext) {
    const session = await this.findOpenOf(tenant, tenant.userId);
    return session ? this.withTotals(this.prisma, session) : null;
  }

  async findOne(tenant: TenantContext, id: string) {
    return this.withTotals(this.prisma, await this.getAccessible(tenant, id));
  }

  async getAccessible(tenant: TenantContext, id: string): Promise<SessionRecord> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: SESSION_SELECT,
    });
    return assertFound(tenant, session, ErrorCode.CASH_SESSION_NOT_FOUND, 'Cash session');
  }

  // ─── used by payments/refunds/expenses (inside their transaction) ───────────

  /**
   * The caller's OPEN drawer in `branchId`, locked `FOR UPDATE` so it cannot be
   * closed while cash is being recorded against it. Lock order: invoices → cash_sessions.
   */
  async requireOpenWithinTx(tx: Tx, tenant: TenantContext, branchId: string): Promise<string> {
    const session = await tx.cashSession.findFirst({
      where: {
        organizationId: tenant.organizationId,
        cashierId: tenant.userId,
        status: CashSessionStatus.OPEN,
      },
      select: { id: true, branchId: true },
    });
    if (!session || session.branchId !== branchId) throw sessionRequired();

    await lockRows(tx, 'cash_sessions', [session.id], tenant.organizationId);
    const fresh = await tx.cashSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { status: true },
    });
    if (fresh.status !== CashSessionStatus.OPEN) throw sessionRequired();
    return session.id;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private findOpenOf(tenant: TenantContext, cashierId: string) {
    return this.prisma.cashSession.findFirst({
      where: {
        organizationId: tenant.organizationId,
        cashierId,
        status: CashSessionStatus.OPEN,
      },
      select: SESSION_SELECT,
    });
  }

  private async withTotals(db: Db, session: SessionRecord) {
    return { ...session, totals: await computeTotals(db, session) };
  }
}

async function computeTotals(
  db: Db,
  session: { id: string; openingBalance: Money },
): Promise<CashSessionTotals> {
  const where = { cashSessionId: session.id };
  const [payments, refunds, expenses] = await Promise.all([
    db.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    db.refund.aggregate({ where, _sum: { amount: true } }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  const cashIn = money(payments._sum.amount);
  const refundsOut = money(refunds._sum.amount);
  const expensesOut = money(expenses._sum.amount);
  return {
    cashIn,
    refundsOut,
    expensesOut,
    expectedBalance: session.openingBalance.plus(cashIn).minus(refundsOut).minus(expensesOut),
    paymentCount: payments._count._all,
  };
}

function assertOwner(tenant: TenantContext, session: { cashierId: string }): void {
  if (session.cashierId !== tenant.userId) {
    throw AppException.forbidden(
      ErrorCode.CASH_SESSION_NOT_OWNER,
      'Only the cashier who opened the session can close it',
    );
  }
}

function assertOpen(session: { status: CashSessionStatus }): void {
  if (session.status !== CashSessionStatus.OPEN) {
    throw AppException.conflict(ErrorCode.CASH_SESSION_CLOSED, 'Cash session is already closed');
  }
}

const alreadyOpen = (id?: string): AppException =>
  AppException.conflict(
    ErrorCode.CASH_SESSION_ALREADY_OPEN,
    id ? `You already have an open cash session (${id})` : 'You already have an open cash session',
  );

const sessionRequired = (): AppException =>
  AppException.conflict(
    ErrorCode.CASH_SESSION_REQUIRED,
    'Open a cash session in this branch before handling cash',
  );
