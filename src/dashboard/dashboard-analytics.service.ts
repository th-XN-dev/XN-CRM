import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { type Money, money, ZERO } from '../finance/common/money';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import {
  periodBuckets,
  previousPeriod,
  type ReportPeriod,
  resolvePeriod,
} from '../reports/common/report-period';
import { bucketUnit, percent, periodInfo } from '../reports/common/report-scope';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type DashboardAnalyticsQueryDto } from './dashboard-analytics.dto';

type Sql = Prisma.Sql;
type MoneyRow = { amount: Prisma.Decimal | null };
type BucketMoneyRow = { bucket: Date; amount: Prisma.Decimal | null; count: number };
type BucketCountRow = { bucket: Date; count: number };
type AttendanceTotals = {
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  lessons: number;
};
type AttendanceUnitRow = {
  id: string;
  name: string;
  marks: number;
  present: number;
  absent: number;
  late: number;
};

/** The slice every query is cut to: branches (null = all) and the group dimension. */
interface Slice {
  organizationId: string;
  branchIds: string[] | null;
  /** SQL selecting the ids of the groups that match group/course/level/teacher; null = no such filter. */
  groups: Sql | null;
  cashierId: string | null;
}

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The dashboard's analytics: students, money and attendance for one period
 * and slice (sub-center → branch → group/course/level/teacher, cashier for
 * money), each number with the previous period of the same length and a time
 * series. Everything is aggregated in SQL; sections the caller may not see
 * are `null`.
 */
@Injectable()
export class DashboardAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(tenant: TenantContext, query: DashboardAnalyticsQueryDto) {
    const period = resolvePeriod(
      query.date ? { from: query.date, to: query.date } : query,
      tenant.timezone,
    );
    const previous = previousPeriod(period);
    const slice = await this.slice(tenant, query);
    const can = (key: string) => tenant.permissions.has(key);

    const [students, finance, attendance] = await Promise.all([
      can(PERMISSIONS.STUDENTS_READ) ? this.students(slice, period, previous) : null,
      can(PERMISSIONS.FINANCE_REPORT_READ)
        ? this.finance(slice, period, previous, tenant.timezone)
        : null,
      can(PERMISSIONS.ATTENDANCE_READ) ? this.attendance(slice, period, previous) : null,
    ]);
    return {
      period: periodInfo(period),
      previousPeriod: periodInfo(previous),
      granularity: period.granularity,
      students,
      finance,
      attendance,
    };
  }

  // ─── Slice ─────────────────────────────────────────────────────────────

  private async slice(tenant: TenantContext, query: DashboardAnalyticsQueryDto): Promise<Slice> {
    const requested = query.branchId ?? tenant.branchId ?? undefined;
    if (requested) assertBranchAccess(tenant, requested);
    let branchIds: string[] | null = requested ? [requested] : restrictedBranchIds(tenant);
    if (query.subCenterId) {
      const inSubCenter = (
        await this.prisma.branch.findMany({
          where: { organizationId: tenant.organizationId, subCenterId: query.subCenterId },
          select: { id: true },
        })
      ).map((b) => b.id);
      branchIds = branchIds ? branchIds.filter((id) => inSubCenter.includes(id)) : inSubCenter;
    }

    const conditions: Sql[] = [];
    if (query.groupId) conditions.push(Prisma.sql`g.id = ${query.groupId}::uuid`);
    if (query.courseId) conditions.push(Prisma.sql`g.course_id = ${query.courseId}::uuid`);
    if (query.levelId) conditions.push(Prisma.sql`g.level_id = ${query.levelId}::uuid`);
    if (query.teacherId) conditions.push(Prisma.sql`g.teacher_id = ${query.teacherId}::uuid`);
    return {
      organizationId: tenant.organizationId,
      branchIds,
      groups: conditions.length
        ? Prisma.sql`SELECT g.id FROM groups g WHERE g.organization_id = ${tenant.organizationId}::uuid AND ${Prisma.join(conditions, ' AND ')}`
        : null,
      cashierId: query.cashierId ?? null,
    };
  }

  private branch(slice: Slice, column: string): Sql {
    return slice.branchIds
      ? Prisma.sql`AND ${Prisma.raw(column)} = ANY(${slice.branchIds}::uuid[])`
      : Prisma.empty;
  }

  /** Students taught in the matching groups (any enrollment, past or present). */
  private student(slice: Slice, column: string): Sql {
    return slice.groups
      ? Prisma.sql`AND ${Prisma.raw(column)} IN (SELECT e.student_id FROM enrollments e WHERE e.group_id IN (${slice.groups}))`
      : Prisma.empty;
  }

  // ─── Students ──────────────────────────────────────────────────────────

  private async students(slice: Slice, period: ReportPeriod, previous: ReportPeriod) {
    const where = Prisma.sql`s.organization_id = ${slice.organizationId}::uuid ${this.branch(slice, 's.branch_id')} ${this.student(slice, 's.id')}`;
    const [byStatus, current, before, series] = await Promise.all([
      this.prisma.$queryRaw<{ status: string; count: number }[]>`
        SELECT s.status::text AS status, COUNT(*)::int AS count FROM students s WHERE ${where} GROUP BY 1`,
      this.count(Prisma.sql`SELECT COUNT(*)::int AS count FROM students s WHERE ${where}
        AND s.joined_at BETWEEN ${period.fromDate}::date AND ${period.toDate}::date`),
      this.count(Prisma.sql`SELECT COUNT(*)::int AS count FROM students s WHERE ${where}
        AND s.joined_at BETWEEN ${previous.fromDate}::date AND ${previous.toDate}::date`),
      this.prisma.$queryRaw<BucketCountRow[]>`
        SELECT date_trunc(${bucketUnit(period)}, s.joined_at)::date AS bucket, COUNT(*)::int AS count
        FROM students s WHERE ${where}
          AND s.joined_at BETWEEN ${period.fromDate}::date AND ${period.toDate}::date
        GROUP BY 1`,
    ]);
    const by = (status: string) => byStatus.find((row) => row.status === status)?.count ?? 0;
    const counts = new Map(series.map((row) => [ymd(row.bucket), row.count]));
    return {
      total: byStatus.reduce((sum, row) => sum + row.count, 0),
      active: by('ACTIVE'),
      frozen: by('FROZEN'),
      graduated: by('GRADUATED'),
      left: by('LEFT'),
      newStudents: compared(current, before),
      series: periodBuckets(period).map((bucket) => ({
        bucket,
        newStudents: counts.get(bucket) ?? 0,
      })),
    };
  }

  // ─── Money ─────────────────────────────────────────────────────────────

  private async finance(
    slice: Slice,
    period: ReportPeriod,
    previous: ReportPeriod,
    timeZone: string,
  ) {
    const org = slice.organizationId;
    const invoices = Prisma.sql`i.organization_id = ${org}::uuid AND i.status <> 'CANCELLED' ${this.branch(slice, 'i.branch_id')} ${this.student(slice, 'i.student_id')}`;
    const cashier = slice.cashierId
      ? Prisma.sql`AND p.cashier_id = ${slice.cashierId}::uuid`
      : Prisma.empty;
    const payments = Prisma.sql`p.organization_id = ${org}::uuid ${this.branch(slice, 'p.branch_id')} ${this.student(slice, 'p.student_id')} ${cashier}`;
    const refundCashier = slice.cashierId
      ? Prisma.sql`AND r.payment_id IN (SELECT id FROM payments WHERE cashier_id = ${slice.cashierId}::uuid)`
      : Prisma.empty;
    const refundStudents = slice.groups
      ? Prisma.sql`AND r.invoice_id IN (SELECT i.id FROM invoices i WHERE i.organization_id = ${org}::uuid ${this.student(slice, 'i.student_id')})`
      : Prisma.empty;
    const refunds = Prisma.sql`r.organization_id = ${org}::uuid ${this.branch(slice, 'r.branch_id')} ${refundStudents} ${refundCashier}`;
    const issued = (p: ReportPeriod) =>
      Prisma.sql`i.issue_date BETWEEN ${p.fromDate}::date AND ${p.toDate}::date`;
    const paidOn = (p: ReportPeriod) =>
      Prisma.sql`p.payment_date BETWEEN ${p.fromDate}::date AND ${p.toDate}::date`;
    const refundedIn = (p: ReportPeriod) =>
      Prisma.sql`r.refunded_at >= ${p.start} AND r.refunded_at < ${p.end}`;
    /** Open balance of one invoice row `i`. */
    const balance = Prisma.sql`i.final_amount
      - COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.invoice_id = i.id), 0)
      + COALESCE((SELECT SUM(y.amount) FROM refunds y WHERE y.invoice_id = i.id), 0)`;
    const open = Prisma.sql`i.status IN ('PENDING', 'PARTIAL')`;
    const today = todayIn(timeZone);
    const sum = (sql: Sql) =>
      this.prisma.$queryRaw<MoneyRow[]>(sql).then((r) => money(r[0]?.amount));
    const unit = bucketUnit(period);

    const [
      expected,
      expectedBefore,
      discounts,
      paid,
      paidBefore,
      refunded,
      refundedBefore,
      unpaid,
      debt,
      overdueDebt,
      prepayment,
      invoicedSeries,
      paidSeries,
      refundSeries,
      openingInvoiced,
      openingPaid,
      openingRefunded,
      branchCollected,
      branchRefunded,
      branchDebt,
      byCashier,
      byMethod,
    ] = await Promise.all([
      sum(
        Prisma.sql`SELECT SUM(i.final_amount) AS amount FROM invoices i WHERE ${invoices} AND ${issued(period)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(i.final_amount) AS amount FROM invoices i WHERE ${invoices} AND ${issued(previous)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(i.discount) AS amount FROM invoices i WHERE ${invoices} AND ${issued(period)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(p.amount) AS amount FROM payments p WHERE ${payments} AND ${paidOn(period)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(p.amount) AS amount FROM payments p WHERE ${payments} AND ${paidOn(previous)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(r.amount) AS amount FROM refunds r WHERE ${refunds} AND ${refundedIn(period)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(r.amount) AS amount FROM refunds r WHERE ${refunds} AND ${refundedIn(previous)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(${balance}) AS amount FROM invoices i WHERE ${invoices} AND ${open} AND ${issued(period)}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(${balance}) AS amount FROM invoices i WHERE ${invoices} AND ${open}`,
      ),
      sum(
        Prisma.sql`SELECT SUM(${balance}) AS amount FROM invoices i WHERE ${invoices} AND ${open} AND i.due_date < ${today}::date`,
      ),
      sum(Prisma.sql`SELECT SUM(p.amount) AS amount FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE ${payments} AND ${paidOn(period)} AND i.due_date > ${period.toDate}::date`),
      this.prisma.$queryRaw<BucketMoneyRow[]>`
        SELECT date_trunc(${unit}, i.issue_date)::date AS bucket, SUM(i.final_amount) AS amount, COUNT(*)::int AS count
        FROM invoices i WHERE ${invoices} AND ${issued(period)} GROUP BY 1`,
      this.prisma.$queryRaw<BucketMoneyRow[]>`
        SELECT date_trunc(${unit}, p.payment_date)::date AS bucket, SUM(p.amount) AS amount, COUNT(*)::int AS count
        FROM payments p WHERE ${payments} AND ${paidOn(period)} GROUP BY 1`,
      this.prisma.$queryRaw<BucketMoneyRow[]>`
        SELECT date_trunc(${unit}, (r.refunded_at AT TIME ZONE ${timeZone}))::date AS bucket, SUM(r.amount) AS amount, COUNT(*)::int AS count
        FROM refunds r WHERE ${refunds} AND ${refundedIn(period)} GROUP BY 1`,
      // Opening balance for the debt line (everything before the period).
      sum(
        Prisma.sql`SELECT SUM(i.final_amount) AS amount FROM invoices i WHERE ${invoices} AND i.issue_date < ${period.fromDate}::date`,
      ),
      sum(
        Prisma.sql`SELECT SUM(p.amount) AS amount FROM payments p WHERE p.organization_id = ${org}::uuid ${this.branch(slice, 'p.branch_id')} ${this.student(slice, 'p.student_id')} AND p.payment_date < ${period.fromDate}::date`,
      ),
      sum(
        Prisma.sql`SELECT SUM(r.amount) AS amount FROM refunds r WHERE r.organization_id = ${org}::uuid ${this.branch(slice, 'r.branch_id')} ${refundStudents} AND r.refunded_at < ${period.start}`,
      ),
      this.prisma.$queryRaw<{ id: string; amount: Prisma.Decimal | null }[]>`
        SELECT p.branch_id AS id, SUM(p.amount) AS amount FROM payments p WHERE ${payments} AND ${paidOn(period)} GROUP BY 1`,
      this.prisma.$queryRaw<{ id: string; amount: Prisma.Decimal | null }[]>`
        SELECT r.branch_id AS id, SUM(r.amount) AS amount FROM refunds r WHERE ${refunds} AND ${refundedIn(period)} GROUP BY 1`,
      this.prisma.$queryRaw<{ id: string; amount: Prisma.Decimal | null }[]>`
        SELECT i.branch_id AS id, SUM(${balance}) AS amount FROM invoices i WHERE ${invoices} AND ${open} GROUP BY 1`,
      this.prisma.$queryRaw<
        { id: string; name: string; amount: Prisma.Decimal | null; count: number }[]
      >`
        SELECT p.cashier_id AS id, u.name AS name, SUM(p.amount) AS amount, COUNT(*)::int AS count
        FROM payments p JOIN users u ON u.id = p.cashier_id
        WHERE ${payments} AND ${paidOn(period)} GROUP BY 1, 2 ORDER BY 3 DESC`,
      this.prisma.$queryRaw<{ method: string; amount: Prisma.Decimal | null; count: number }[]>`
        SELECT p.method::text AS method, SUM(p.amount) AS amount, COUNT(*)::int AS count
        FROM payments p WHERE ${payments} AND ${paidOn(period)} GROUP BY 1 ORDER BY 2 DESC`,
    ]);

    // Time series: income per bucket and the debt line (running balance).
    const byBucket = (rows: BucketMoneyRow[]) =>
      new Map(rows.map((r) => [ymd(r.bucket), money(r.amount)]));
    const inv = byBucket(invoicedSeries);
    const pay = byBucket(paidSeries);
    const ref = byBucket(refundSeries);
    let running = openingInvoiced.minus(openingPaid).plus(openingRefunded);
    const series = periodBuckets(period).map((bucket) => {
      const invoiced = inv.get(bucket) ?? ZERO;
      const income = (pay.get(bucket) ?? ZERO).minus(ref.get(bucket) ?? ZERO);
      running = running
        .plus(invoiced)
        .minus(pay.get(bucket) ?? ZERO)
        .plus(ref.get(bucket) ?? ZERO);
      return { bucket, income, invoiced, debt: running };
    });

    // Per branch and per sub-center.
    const branchIds = [...new Set([...branchCollected, ...branchDebt].map((r) => r.id))];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, organizationId: org },
      select: { id: true, name: true, subCenter: { select: { id: true, name: true } } },
    });
    const amountOf = (rows: { id: string; amount: Prisma.Decimal | null }[], id: string) =>
      money(rows.find((r) => r.id === id)?.amount);
    const byBranch = branches
      .map((b) => ({
        id: b.id,
        name: b.name,
        subCenter: b.subCenter,
        collected: amountOf(branchCollected, b.id).minus(amountOf(branchRefunded, b.id)),
        debt: amountOf(branchDebt, b.id),
      }))
      .sort((a, b) => b.collected.comparedTo(a.collected));
    const subCenters = new Map<
      string,
      { id: string; name: string; collected: Money; debt: Money }
    >();
    for (const b of byBranch) {
      const key = b.subCenter?.id ?? 'direct';
      const row = subCenters.get(key) ?? {
        id: key,
        name: b.subCenter?.name ?? '',
        collected: ZERO,
        debt: ZERO,
      };
      row.collected = row.collected.plus(b.collected);
      row.debt = row.debt.plus(b.debt);
      subCenters.set(key, row);
    }

    return {
      expected: comparedMoney(expected, expectedBefore),
      collected: comparedMoney(paid.minus(refunded), paidBefore.minus(refundedBefore)),
      paid,
      refunds: refunded,
      discounts,
      unpaid,
      debt,
      overdueDebt,
      prepayment,
      series,
      byBranch: byBranch.map(({ subCenter: _s, ...row }) => row),
      bySubCenter: [...subCenters.values()].sort((a, b) => b.collected.comparedTo(a.collected)),
      byCashier: byCashier.map((r) => ({
        id: r.id,
        name: r.name,
        amount: money(r.amount),
        payments: r.count,
      })),
      byMethod: byMethod.map((r) => ({
        method: r.method,
        amount: money(r.amount),
        payments: r.count,
      })),
    };
  }

  // ─── Attendance ────────────────────────────────────────────────────────

  private async attendance(slice: Slice, period: ReportPeriod, previous: ReportPeriod) {
    const base = (p: ReportPeriod) => Prisma.sql`a.organization_id = ${slice.organizationId}::uuid
      AND a.date BETWEEN ${p.fromDate}::date AND ${p.toDate}::date
      ${this.branch(slice, 'a.branch_id')}
      ${slice.groups ? Prisma.sql`AND a.group_id IN (${slice.groups})` : Prisma.empty}`;
    const counters = Prisma.sql`COUNT(*)::int AS marks,
      (COUNT(*) FILTER (WHERE a.status = 'PRESENT'))::int AS present,
      (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
      (COUNT(*) FILTER (WHERE a.status = 'LATE'))::int AS late`;
    const [totals, before, series, byGroup, byBranch, byTeacher] = await Promise.all([
      this.prisma.$queryRaw<AttendanceTotals[]>`
        SELECT ${counters},
               (COUNT(*) FILTER (WHERE a.status = 'EXCUSED'))::int AS excused,
               COUNT(DISTINCT (a.group_id, a.date))::int AS lessons
        FROM attendance a WHERE ${base(period)}`,
      this.prisma.$queryRaw<AttendanceTotals[]>`
        SELECT ${counters}, 0 AS excused, 0 AS lessons FROM attendance a WHERE ${base(previous)}`,
      this.prisma.$queryRaw<{ bucket: Date; marks: number; attended: number }[]>`
        SELECT date_trunc(${bucketUnit(period)}, a.date)::date AS bucket, COUNT(*)::int AS marks,
               (COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE')))::int AS attended
        FROM attendance a WHERE ${base(period)} GROUP BY 1`,
      this.prisma.$queryRaw<AttendanceUnitRow[]>`
        SELECT g.id, g.name, ${counters} FROM attendance a JOIN groups g ON g.id = a.group_id
        WHERE ${base(period)} GROUP BY g.id, g.name`,
      this.prisma.$queryRaw<AttendanceUnitRow[]>`
        SELECT b.id, b.name, ${counters} FROM attendance a JOIN branches b ON b.id = a.branch_id
        WHERE ${base(period)} GROUP BY b.id, b.name`,
      this.prisma.$queryRaw<AttendanceUnitRow[]>`
        SELECT t.id, t.first_name || ' ' || t.last_name AS name, ${counters}
        FROM attendance a JOIN groups g ON g.id = a.group_id JOIN teachers t ON t.id = g.teacher_id
        WHERE ${base(period)} GROUP BY t.id, 2`,
    ]);
    const now = totals[0] ?? emptyTotals();
    const then = before[0] ?? emptyTotals();
    const rateOf = (t: { marks: number; present: number; late: number }) =>
      percent(t.present + t.late, t.marks);
    const points = new Map(series.map((row) => [ymd(row.bucket), row]));
    const units = (rows: AttendanceUnitRow[]) =>
      rows
        .map((row) => ({ ...row, rate: rateOf(row) }))
        // Weakest first: that's where attention is needed.
        .sort((a, b) => a.rate - b.rate || b.marks - a.marks);
    return {
      lessons: now.lessons,
      marks: now.marks,
      present: now.present,
      absent: now.absent,
      late: now.late,
      excused: now.excused,
      rate: compared(rateOf(now), rateOf(then)),
      series: periodBuckets(period).map((bucket) => {
        const row = points.get(bucket);
        return {
          bucket,
          marks: row?.marks ?? 0,
          attended: row?.attended ?? 0,
          rate: row ? percent(row.attended, row.marks) : 0,
        };
      }),
      byGroup: units(byGroup).slice(0, 30),
      byBranch: units(byBranch),
      byTeacher: units(byTeacher),
    };
  }

  private async count(sql: Sql): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(sql);
    return rows[0]?.count ?? 0;
  }
}

function compared(current: number, previous: number) {
  const change = Math.round((current - previous) * 100) / 100;
  return {
    current,
    previous,
    change,
    changeRate: previous === 0 ? null : percent(current - previous, previous),
  };
}

function comparedMoney(current: Money, previous: Money) {
  return {
    current,
    previous,
    change: current.minus(previous),
    changeRate: previous.isZero()
      ? null
      : Math.round(current.minus(previous).div(previous).times(10_000).toNumber()) / 100,
  };
}

const emptyTotals = (): AttendanceTotals => ({
  marks: 0,
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  lessons: 0,
});
