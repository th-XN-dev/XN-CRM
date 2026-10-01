import { Prisma } from '@prisma/client';
import { branchListFilter } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { type ReportPeriod } from './report-period';

/** Raw-SQL twin of `scopedBranchWhere`: `AND <column> = …` for the caller's branches. */
export function sqlBranchFilter(
  tenant: TenantContext,
  column: Prisma.Sql,
  requestedBranchId?: string,
): Prisma.Sql {
  const filter = branchListFilter(tenant, requestedBranchId);
  if (filter === undefined) return Prisma.empty;
  if (typeof filter === 'string') return Prisma.sql`AND ${column} = ${filter}::uuid`;
  return Prisma.sql`AND ${column} = ANY(${filter.in}::uuid[])`;
}

/** The period block every report response starts with. */
export const periodInfo = (period: ReportPeriod) => ({
  name: period.name,
  from: period.from,
  to: period.to,
  timezone: period.timezone,
});

/** Safe percentage with 2 decimals; 0 when there is nothing to divide by. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10_000) / 100 : 0;
}

/** Postgres `date_trunc` unit for the period's buckets. */
export const bucketUnit = (period: ReportPeriod): Prisma.Sql =>
  period.granularity === 'month' ? Prisma.sql`'month'` : Prisma.sql`'day'`;
