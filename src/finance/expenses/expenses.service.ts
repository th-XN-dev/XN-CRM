import { Injectable } from '@nestjs/common';
import { CashSessionStatus, ExpensePaymentMethod, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { parseDateOnly, todayIn } from '../../common/utils/dates';
import { PrismaService } from '../../database/prisma.service';
import { lockRows } from '../../database/row-lock';
import { BranchAccessService } from '../../tenancy/branch-access.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import { assertFound, dateRangeFilter, financeScope } from '../common/finance-access';
import { money } from '../common/money';
import {
  type CreateExpenseDto,
  type ListExpensesDto,
  type UpdateExpenseDto,
} from './dto/expense.dto';

const EXPENSE_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  category: true,
  amount: true,
  paymentMethod: true,
  description: true,
  expenseDate: true,
  createdById: true,
  cashSessionId: true,
  createdBy: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExpenseSelect;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof EXPENSE_SELECT }>;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
    private readonly cashSessions: CashSessionsService,
  ) {}

  async create(tenant: TenantContext, dto: CreateExpenseDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    const expenseDate = dto.expenseDate ? parseDateOnly(dto.expenseDate) : todayIn(tenant.timezone);

    const expense = await this.prisma.$transaction(async (tx) => {
      const cashSessionId =
        dto.paymentMethod === ExpensePaymentMethod.CASH
          ? await this.cashSessions.requireOpenWithinTx(tx, tenant, branchId)
          : null;
      return tx.expense.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          category: dto.category,
          amount: money(dto.amount),
          paymentMethod: dto.paymentMethod,
          description: dto.description,
          expenseDate,
          createdById: tenant.userId,
          cashSessionId,
        },
        select: EXPENSE_SELECT,
      });
    });

    this.events.publish(tenant, {
      name: DomainEventName.EXPENSE_CREATED,
      entityType: 'Expense',
      entityId: expense.id,
      payload: {
        branchId,
        category: expense.category,
        amount: expense.amount.toString(),
        paymentMethod: expense.paymentMethod,
      },
    });
    return expense;
  }

  async update(tenant: TenantContext, id: string, dto: UpdateExpenseDto) {
    const current = await this.getAccessible(tenant, id);

    const expense = await this.prisma.$transaction(async (tx) => {
      // A closed drawer's totals are final: its cash expenses keep their amount.
      if (dto.amount !== undefined && current.cashSessionId) {
        await lockRows(tx, 'cash_sessions', [current.cashSessionId], tenant.organizationId);
        const session = await tx.cashSession.findUniqueOrThrow({
          where: { id: current.cashSessionId },
          select: { status: true },
        });
        if (session.status !== CashSessionStatus.OPEN) {
          throw AppException.conflict(
            ErrorCode.CASH_SESSION_CLOSED,
            'The cash session of this expense is closed; its amount cannot change',
          );
        }
      }
      return tx.expense.update({
        where: { id },
        data: {
          category: dto.category,
          amount: dto.amount !== undefined ? money(dto.amount) : undefined,
          expenseDate: dto.expenseDate ? parseDateOnly(dto.expenseDate) : undefined,
          description: dto.description,
        },
        select: EXPENSE_SELECT,
      });
    });

    this.events.publish(tenant, {
      name: DomainEventName.EXPENSE_UPDATED,
      entityType: 'Expense',
      entityId: id,
      payload: { fields: Object.keys(dto) },
    });
    return expense;
  }

  async list(tenant: TenantContext, query: ListExpensesDto) {
    const where: Prisma.ExpenseWhereInput = {
      ...financeScope(tenant, query.branchId),
      category: query.category,
      paymentMethod: query.paymentMethod,
      createdById: query.createdById,
      cashSessionId: query.cashSessionId,
      expenseDate: dateRangeFilter(query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: EXPENSE_SELECT,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  findOne(tenant: TenantContext, id: string) {
    return this.getAccessible(tenant, id);
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<ExpenseRecord> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: EXPENSE_SELECT,
    });
    return assertFound(tenant, expense, ErrorCode.EXPENSE_NOT_FOUND, 'Expense');
  }
}
