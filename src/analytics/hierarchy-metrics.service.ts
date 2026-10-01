import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { type Money, money, ZERO } from '../finance/common/money';
import { previousPeriod, type ReportPeriod } from '../reports/common/report-period';
import { percent } from '../reports/common/report-scope';

/** What a row of the hierarchy is keyed by: a center (owner) or a branch (director). */
export type MetricsDimension = 'center' | 'branch';

export interface MetricsScope {
  dimension: MetricsDimension;
  /** Limit to one center (director analytics). */
  organizationId?: string;
  /** Limit to these branches; null/undefined = every branch in scope. */
  branchIds?: readonly string[] | null;
}

export interface UnitMetrics {
  activeStudents: number;
  newStudents: number;
  /** New students in the previous period of the same length. */
  previousNewStudents: number;
  /** Change of new students vs the previous period, in percent (null when there were none before). */
  growthRate: number | null;
  activeFamilies: number;
  activeGroups: number;
  attendanceMarks: number;
  /** PRESENT + LATE marks. */
  attendedMarks: number;
  attendanceRate: number;
  /** Payments − refunds in the period. */
  revenue: Money;
  /** Outstanding now (not limited to the period). */
  debt: Money;
  newLeads: number;
  convertedLeads: number;
  conversionRate: number;
  openTasks: number;
  overdueTasks: number;
}

type CountRow = { key: string; count: number };
type MoneyRow = { key: string; amount: Prisma.Decimal | null };
type AttendanceRow = { key: string; total: number; attended: number };

/**
 * Aggregates the CRM per center or per branch in the database — one grouped
 * query per metric, never rows pulled into the app. Owner and director
 * analytics both read from here, so a metric means the same everywhere.
 */
@Injectable()
export class HierarchyMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async collect(scope: MetricsScope, period: ReportPeriod): Promise<Map<string, UnitMetrics>> {
    const previous = previousPeriod(period);
    const days = (p: ReportPeriod) => Prisma.sql`BETWEEN ${p.fromDate}::date AND ${p.toDate}::date`;
    const instants = (column: string, p: ReportPeriod) =>
      Prisma.sql`${Prisma.raw(column)} >= ${p.start} AND ${Prisma.raw(column)} < ${p.end}`;
    const key = (branchColumn = 'branch_id') =>
      Prisma.raw(scope.dimension === 'center' ? 'organization_id' : branchColumn);
    const where = (branchColumn = 'branch_id') => {
      const parts: Prisma.Sql[] = [];
      if (scope.organizationId)
        parts.push(Prisma.sql`organization_id = ${scope.organizationId}::uuid`);
      if (scope.branchIds) {
        parts.push(Prisma.sql`${Prisma.raw(branchColumn)} = ANY(${[...scope.branchIds]}::uuid[])`);
      }
      if (scope.dimension === 'branch')
        parts.push(Prisma.sql`${Prisma.raw(branchColumn)} IS NOT NULL`);
      return parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
    };
    const count = (sql: Prisma.Sql) => this.prisma.$queryRaw<CountRow[]>(sql);
    const sum = (sql: Prisma.Sql) => this.prisma.$queryRaw<MoneyRow[]>(sql);

    const [
      students,
      newStudents,
      previousNew,
      families,
      groups,
      attendance,
      payments,
      refunds,
      debt,
      leads,
      converted,
      openTasks,
      overdueTasks,
    ] = await Promise.all([
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM students
        WHERE status = 'ACTIVE' ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM students
        WHERE joined_at ${days(period)} ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM students
        WHERE joined_at ${days(previous)} ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key('primary_branch_id')} AS key, COUNT(*)::int AS count FROM families
        WHERE is_active ${where('primary_branch_id')} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM groups
        WHERE status = 'ACTIVE' ${where()} GROUP BY 1`),
      this.prisma.$queryRaw<AttendanceRow[]>(Prisma.sql`
        SELECT ${key()} AS key, COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')))::int AS attended
        FROM attendance WHERE date ${days(period)} ${where()} GROUP BY 1`),
      sum(Prisma.sql`SELECT ${key()} AS key, SUM(amount) AS amount FROM payments
        WHERE payment_date ${days(period)} ${where()} GROUP BY 1`),
      sum(Prisma.sql`SELECT ${key()} AS key, SUM(amount) AS amount FROM refunds
        WHERE ${instants('refunded_at', period)} ${where()} GROUP BY 1`),
      // Balances are never stored: debt = invoiced − paid + refunded on open invoices.
      sum(Prisma.sql`SELECT ${key()} AS key,
          SUM(i.final_amount
              - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
              + COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.id), 0)) AS amount
        FROM invoices i WHERE i.status IN ('PENDING', 'PARTIAL') ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM leads
        WHERE deleted_at IS NULL AND ${instants('created_at', period)} ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM leads
        WHERE deleted_at IS NULL AND ${instants('converted_at', period)} ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM tasks
        WHERE deleted_at IS NULL AND status NOT IN ('COMPLETED', 'CANCELLED') ${where()} GROUP BY 1`),
      count(Prisma.sql`SELECT ${key()} AS key, COUNT(*)::int AS count FROM tasks
        WHERE deleted_at IS NULL AND status NOT IN ('COMPLETED', 'CANCELLED') AND due_date < now()
        ${where()} GROUP BY 1`),
    ]);

    const result = new Map<string, UnitMetrics>();
    const unit = (id: string): UnitMetrics => {
      let row = result.get(id);
      if (!row) {
        row = emptyMetrics();
        result.set(id, row);
      }
      return row;
    };
    const assign = (rows: CountRow[], field: keyof UnitMetrics) => {
      for (const row of rows) (unit(row.key)[field] as number) = row.count;
    };
    assign(students, 'activeStudents');
    assign(newStudents, 'newStudents');
    assign(previousNew, 'previousNewStudents');
    assign(families, 'activeFamilies');
    assign(groups, 'activeGroups');
    assign(leads, 'newLeads');
    assign(converted, 'convertedLeads');
    assign(openTasks, 'openTasks');
    assign(overdueTasks, 'overdueTasks');
    for (const row of attendance) {
      const target = unit(row.key);
      target.attendanceMarks = row.total;
      target.attendedMarks = row.attended;
    }
    for (const row of payments) unit(row.key).revenue = money(row.amount);
    for (const row of refunds) {
      const target = unit(row.key);
      target.revenue = target.revenue.minus(money(row.amount));
    }
    for (const row of debt) unit(row.key).debt = money(row.amount);
    for (const metrics of result.values()) finish(metrics);
    return result;
  }
}

export function emptyMetrics(): UnitMetrics {
  return {
    activeStudents: 0,
    newStudents: 0,
    previousNewStudents: 0,
    growthRate: null,
    activeFamilies: 0,
    activeGroups: 0,
    attendanceMarks: 0,
    attendedMarks: 0,
    attendanceRate: 0,
    revenue: ZERO,
    debt: ZERO,
    newLeads: 0,
    convertedLeads: 0,
    conversionRate: 0,
    openTasks: 0,
    overdueTasks: 0,
  };
}

/** Rolls several units up into one (sub-center, center or platform total). */
export function sumMetrics(units: Iterable<UnitMetrics>): UnitMetrics {
  const total = emptyMetrics();
  for (const unit of units) {
    total.activeStudents += unit.activeStudents;
    total.newStudents += unit.newStudents;
    total.previousNewStudents += unit.previousNewStudents;
    total.activeFamilies += unit.activeFamilies;
    total.activeGroups += unit.activeGroups;
    total.attendanceMarks += unit.attendanceMarks;
    total.attendedMarks += unit.attendedMarks;
    total.revenue = total.revenue.plus(unit.revenue);
    total.debt = total.debt.plus(unit.debt);
    total.newLeads += unit.newLeads;
    total.convertedLeads += unit.convertedLeads;
    total.openTasks += unit.openTasks;
    total.overdueTasks += unit.overdueTasks;
  }
  return finish(total);
}

function finish(metrics: UnitMetrics): UnitMetrics {
  metrics.attendanceRate = percent(metrics.attendedMarks, metrics.attendanceMarks);
  metrics.conversionRate = percent(metrics.convertedLeads, metrics.newLeads);
  metrics.growthRate =
    metrics.previousNewStudents > 0
      ? percent(metrics.newStudents - metrics.previousNewStudents, metrics.previousNewStudents)
      : null;
  return metrics;
}
