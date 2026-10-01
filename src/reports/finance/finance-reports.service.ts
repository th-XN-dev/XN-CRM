import { Injectable } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { Paginated } from '../../common/pagination/paginated';
import { todayIn } from '../../common/utils/dates';
import { PrismaService } from '../../database/prisma.service';
import { type Money, money } from '../../finance/common/money';
import { scopedBranchWhere } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { periodBuckets, resolvePeriod } from '../common/report-period';
import { type ReportPageQueryDto, type ReportQueryDto } from '../common/report-query.dto';
import { bucketUnit, periodInfo, sqlBranchFilter } from '../common/report-scope';

const UNPAID: InvoiceStatus[] = [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL];
const METHODS = Object.values(PaymentMethod);
const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;

type BucketRow = { bucket: Date; amount: Prisma.Decimal | null; count: number };

/**
 * Money reports. Balances are never stored, so debt is always derived from
 * invoices − payments + refunds; period sums use the business date columns
 * (issue/payment/expense date) and local-midnight instants for refunds.
 */
@Injectable()
export class FinanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenant: TenantContext, query: ReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const scope = scopedBranchWhere(tenant, query.branchId);
    const days = { gte: period.fromDate, lte: period.toDate };
    const today = todayIn(tenant.timezone);

    const [invoiced, paid, byMethod, refunded, expenses, totalDebt, overdueDebt] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: { ...scope, status: { not: InvoiceStatus.CANCELLED }, issueDate: days },
          _sum: { finalAmount: true },
          _count: { _all: true },
        }),
        this.prisma.payment.aggregate({
          where: { ...scope, paymentDate: days },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.paymentsByMethod(scope, days),
        this.prisma.refund.aggregate({
          where: { ...scope, refundedAt: { gte: period.start, lt: period.end } },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { ...scope, expenseDate: days },
          _sum: { amount: true },
        }),
        this.outstanding({ ...scope, status: { in: UNPAID } }),
        this.outstanding({ ...scope, status: { in: UNPAID }, dueDate: { lt: today } }),
      ]);

    const totalPaid = money(paid._sum.amount);
    const totalRefunded = money(refunded._sum.amount);
    const totalExpenses = money(expenses._sum.amount);
    return {
      period: periodInfo(period),
      totalInvoiced: money(invoiced._sum.finalAmount),
      invoiceCount: invoiced._count._all,
      totalPaid,
      paymentCount: paid._count._all,
      totalRefunded,
      /** Payments − refunds. */
      netPaid: totalPaid.minus(totalRefunded),
      totalExpenses,
      /** Payments − refunds − expenses. */
      netRevenue: totalPaid.minus(totalRefunded).minus(totalExpenses),
      /** Outstanding now (not limited to the period). */
      totalDebt,
      overdueDebt,
      byMethod,
    };
  }

  /** Income over time: payments and refunds per day (or month for long periods). */
  async revenue(tenant: TenantContext, query: ReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const org = tenant.organizationId;
    const unit = bucketUnit(period);
    const [payments, refunds] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT date_trunc(${unit}, p.payment_date)::date AS bucket,
               SUM(p.amount) AS amount, COUNT(*)::int AS count
        FROM payments p
        WHERE p.organization_id = ${org}::uuid
          AND p.payment_date BETWEEN ${period.fromDate}::date AND ${period.toDate}::date
          ${sqlBranchFilter(tenant, Prisma.sql`p.branch_id`, query.branchId)}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT date_trunc(${unit}, (r.refunded_at AT TIME ZONE ${period.timezone}))::date AS bucket,
               SUM(r.amount) AS amount, COUNT(*)::int AS count
        FROM refunds r
        WHERE r.organization_id = ${org}::uuid
          AND r.refunded_at >= ${period.start} AND r.refunded_at < ${period.end}
          ${sqlBranchFilter(tenant, Prisma.sql`r.branch_id`, query.branchId)}
        GROUP BY 1`,
    ]);
    const income = byBucket(payments);
    const refunded = byBucket(refunds);
    const series = periodBuckets(period).map((bucket) => {
      const inc = income.get(bucket)?.amount ?? money(0);
      const ref = refunded.get(bucket)?.amount ?? money(0);
      return {
        bucket,
        income: inc,
        payments: income.get(bucket)?.count ?? 0,
        refunds: ref,
        net: inc.minus(ref),
      };
    });
    return {
      period: periodInfo(period),
      granularity: period.granularity,
      totalIncome: sum(series.map((row) => row.income)),
      totalRefunds: sum(series.map((row) => row.refunds)),
      series,
    };
  }

  async expenses(tenant: TenantContext, query: ReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const scope = scopedBranchWhere(tenant, query.branchId);
    const [byCategory, buckets] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['category'],
        where: { ...scope, expenseDate: { gte: period.fromDate, lte: period.toDate } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT date_trunc(${bucketUnit(period)}, e.expense_date)::date AS bucket,
               SUM(e.amount) AS amount, COUNT(*)::int AS count
        FROM expenses e
        WHERE e.organization_id = ${tenant.organizationId}::uuid
          AND e.expense_date BETWEEN ${period.fromDate}::date AND ${period.toDate}::date
          ${sqlBranchFilter(tenant, Prisma.sql`e.branch_id`, query.branchId)}
        GROUP BY 1`,
    ]);
    const perBucket = byBucket(buckets);
    const categories = byCategory
      .map((row) => ({
        category: row.category,
        amount: money(row._sum.amount),
        count: row._count._all,
      }))
      .sort((a, b) => b.amount.comparedTo(a.amount));
    return {
      period: periodInfo(period),
      granularity: period.granularity,
      totalExpenses: sum(categories.map((row) => row.amount)),
      byCategory: categories,
      series: periodBuckets(period).map((bucket) => ({
        bucket,
        amount: perBucket.get(bucket)?.amount ?? money(0),
        count: perBucket.get(bucket)?.count ?? 0,
      })),
    };
  }

  /**
   * Receivables as of today (the period is ignored): aging buckets by days
   * past due, and the families that owe the most.
   */
  async debt(tenant: TenantContext, query: ReportPageQueryDto) {
    const today = todayIn(tenant.timezone);
    const openInvoices = Prisma.sql`
      WITH open_invoices AS (
        SELECT i.id, i.family_id, i.due_date,
               i.final_amount - COALESCE(pay.total, 0) + COALESCE(ref.total, 0) AS debt
        FROM invoices i
        LEFT JOIN LATERAL (SELECT SUM(p.amount) AS total FROM payments p WHERE p.invoice_id = i.id) pay ON TRUE
        LEFT JOIN LATERAL (SELECT SUM(r.amount) AS total FROM refunds r WHERE r.invoice_id = i.id) ref ON TRUE
        WHERE i.organization_id = ${tenant.organizationId}::uuid
          AND i.status IN ('PENDING', 'PARTIAL')
          ${sqlBranchFilter(tenant, Prisma.sql`i.branch_id`, query.branchId)}
      )`;
    const [aging, debtors] = await Promise.all([
      this.prisma.$queryRaw<{ bucket: string; count: number; amount: Prisma.Decimal }[]>`
        ${openInvoices}
        SELECT CASE
                 WHEN due_date >= ${today}::date THEN 'current'
                 WHEN due_date >= ${today}::date - 30 THEN '1-30'
                 WHEN due_date >= ${today}::date - 60 THEN '31-60'
                 WHEN due_date >= ${today}::date - 90 THEN '61-90'
                 ELSE '90+'
               END AS bucket,
               COUNT(*)::int AS count, SUM(debt) AS amount
        FROM open_invoices WHERE debt > 0
        GROUP BY 1`,
      this.prisma.$queryRaw<
        {
          familyId: string;
          familyName: string;
          invoices: number;
          amount: Prisma.Decimal;
          oldestDueDate: Date;
          total: number;
        }[]
      >`
        ${openInvoices}
        SELECT o.family_id AS "familyId", f.name AS "familyName",
               COUNT(*)::int AS invoices, SUM(o.debt) AS amount,
               MIN(o.due_date) AS "oldestDueDate", COUNT(*) OVER ()::int AS total
        FROM open_invoices o JOIN families f ON f.id = o.family_id
        WHERE o.debt > 0
        GROUP BY o.family_id, f.name
        ORDER BY amount DESC, o.family_id
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
    ]);
    const buckets = AGING_BUCKETS.map((bucket) => {
      const row = aging.find((r) => r.bucket === bucket);
      return { bucket, invoices: row?.count ?? 0, amount: money(row?.amount) };
    });
    return {
      asOf: today.toISOString().slice(0, 10),
      totalDebt: sum(buckets.map((b) => b.amount)),
      overdueDebt: sum(buckets.filter((b) => b.bucket !== 'current').map((b) => b.amount)),
      aging: buckets,
      topDebtors: new Paginated(
        debtors.map(({ total: _total, ...row }) => ({ ...row, amount: money(row.amount) })),
        debtors[0]?.total ?? 0,
        query,
      ),
    };
  }

  /** Payments received in the period, by method and by cashier. */
  async payments(tenant: TenantContext, query: ReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const scope = scopedBranchWhere(tenant, query.branchId);
    const days = { gte: period.fromDate, lte: period.toDate };
    const [total, byMethod, byCashierRows] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...scope, paymentDate: days },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.paymentsByMethod(scope, days),
      this.prisma.payment.groupBy({
        by: ['cashierId'],
        where: { ...scope, paymentDate: days },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { cashierId: 'asc' },
      }),
    ]);
    const cashiers = await this.prisma.user.findMany({
      where: { id: { in: byCashierRows.map((row) => row.cashierId) } },
      select: { id: true, name: true },
    });
    return {
      period: periodInfo(period),
      totalPaid: money(total._sum.amount),
      paymentCount: total._count._all,
      byMethod,
      byCashier: byCashierRows
        .map((row) => ({
          cashierId: row.cashierId,
          name: cashiers.find((c) => c.id === row.cashierId)?.name ?? null,
          amount: money(row._sum.amount),
          count: row._count._all,
        }))
        .sort((a, b) => b.amount.comparedTo(a.amount)),
    };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /** Every method present (zeros included), so clients get a stable shape. */
  private async paymentsByMethod(
    scope: Prisma.PaymentWhereInput,
    days: Prisma.DateTimeFilter,
  ): Promise<Record<PaymentMethod, { amount: Money; count: number }>> {
    const rows = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { ...scope, paymentDate: days },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { method: 'asc' },
    });
    return Object.fromEntries(
      METHODS.map((method) => {
        const row = rows.find((r) => r.method === method);
        return [method, { amount: money(row?._sum.amount), count: row?._count._all ?? 0 }];
      }),
    ) as Record<PaymentMethod, { amount: Money; count: number }>;
  }

  /** Σ (finalAmount − payments + refunds) over the matching invoices, in three aggregates. */
  private async outstanding(invoiceWhere: Prisma.InvoiceWhereInput): Promise<Money> {
    const [billed, paid, refunded] = await Promise.all([
      this.prisma.invoice.aggregate({ where: invoiceWhere, _sum: { finalAmount: true } }),
      this.prisma.payment.aggregate({ where: { invoice: invoiceWhere }, _sum: { amount: true } }),
      this.prisma.refund.aggregate({ where: { invoice: invoiceWhere }, _sum: { amount: true } }),
    ]);
    return money(billed._sum.finalAmount)
      .minus(money(paid._sum.amount))
      .plus(money(refunded._sum.amount));
  }
}

function byBucket(rows: BucketRow[]): Map<string, { amount: Money; count: number }> {
  return new Map(
    rows.map((row) => [
      row.bucket.toISOString().slice(0, 10),
      { amount: money(row.amount), count: row.count },
    ]),
  );
}

const sum = (values: Money[]): Money => values.reduce((total, v) => total.plus(v), money(0));
