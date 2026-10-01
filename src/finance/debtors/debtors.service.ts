import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseDateOnly, todayIn } from '../../common/utils/dates';
import { PrismaService } from '../../database/prisma.service';
import { sqlBranchFilter } from '../../reports/common/report-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { money } from '../common/money';
import { type ListDebtorsDto } from './debtors.dto';

const SORT_COLUMNS = {
  amount: Prisma.sql`fa.amount`,
  oldestDueDate: Prisma.sql`fa.oldest_due`,
  name: Prisma.sql`f.name`,
} as const;

interface FamilyRow {
  familyId: string;
  familyName: string;
  phone: string;
  studentsCount: number;
  invoices: number;
  amount: Prisma.Decimal;
  overdueAmount: Prisma.Decimal | null;
  oldestDueDate: Date;
  hasPartial: boolean;
  total: number;
  totalDebt: Prisma.Decimal;
  overdueDebt: Prisma.Decimal | null;
}

interface StudentRow {
  familyId: string;
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  invoices: number;
  amount: Prisma.Decimal;
}

/**
 * Who owes what, family by family — the collection screen. Debt is derived
 * (invoice − payments + refunds) exactly like the finance reports; readable
 * with `finance.read` so cashiers can work it.
 */
@Injectable()
export class DebtorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext, query: ListDebtorsDto) {
    const today = todayIn(tenant.timezone);
    const debts = Prisma.sql`
      WITH debts AS (
        SELECT * FROM (
          SELECT i.id, i.family_id, i.student_id, i.due_date, i.status,
                 i.final_amount - COALESCE(pay.total, 0) + COALESCE(ref.total, 0) AS debt
          FROM invoices i
          LEFT JOIN LATERAL (SELECT SUM(p.amount) AS total FROM payments p WHERE p.invoice_id = i.id) pay ON TRUE
          LEFT JOIN LATERAL (SELECT SUM(r.amount) AS total FROM refunds r WHERE r.invoice_id = i.id) ref ON TRUE
          WHERE i.organization_id = ${tenant.organizationId}::uuid
            AND i.status IN ('PENDING', 'PARTIAL')
            ${sqlBranchFilter(tenant, Prisma.sql`i.branch_id`, query.branchId)}
            ${query.dueTo ? Prisma.sql`AND i.due_date <= ${parseDateOnly(query.dueTo)}::date` : Prisma.empty}
        ) open_invoices
        WHERE debt > 0
      )`;

    const filters: Prisma.Sql[] = [];
    if (query.overdue) filters.push(Prisma.sql`fa.overdue_amount > 0`);
    if (query.partial) filters.push(Prisma.sql`fa.has_partial`);
    if (query.minAmount !== undefined) filters.push(Prisma.sql`fa.amount >= ${query.minAmount}`);
    for (const term of query.search?.split(/\s+/).filter(Boolean).slice(0, 5) ?? []) {
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const digits = `%${term.replace(/[\s\-()]/g, '')}%`;
      filters.push(Prisma.sql`(f.name ILIKE ${like} OR f.phone LIKE ${digits})`);
    }
    const where = filters.length
      ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
      : Prisma.empty;
    const direction = Prisma.raw(query.sortOrder === 'asc' ? 'ASC' : 'DESC');

    const families = await this.prisma.$queryRaw<FamilyRow[]>`
      ${debts}
      SELECT fa.family_id AS "familyId", f.name AS "familyName", f.phone,
             fa.students AS "studentsCount", fa.invoices, fa.amount,
             fa.overdue_amount AS "overdueAmount", fa.oldest_due AS "oldestDueDate",
             fa.has_partial AS "hasPartial",
             COUNT(*) OVER ()::int AS total,
             SUM(fa.amount) OVER () AS "totalDebt",
             SUM(fa.overdue_amount) OVER () AS "overdueDebt"
      FROM (
        SELECT family_id, COUNT(*)::int AS invoices, SUM(debt) AS amount,
               COALESCE(SUM(debt) FILTER (WHERE due_date < ${today}::date), 0) AS overdue_amount,
               MIN(due_date) AS oldest_due,
               COUNT(DISTINCT student_id)::int AS students,
               BOOL_OR(status = 'PARTIAL') AS has_partial
        FROM debts GROUP BY family_id
      ) fa
      JOIN families f ON f.id = fa.family_id
      ${where}
      ORDER BY ${SORT_COLUMNS[query.sortBy]} ${direction}, fa.family_id
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`;

    const familyIds = families.map((row) => row.familyId);
    const students = familyIds.length
      ? await this.prisma.$queryRaw<StudentRow[]>`
          ${debts}
          SELECT d.family_id AS "familyId", d.student_id AS "studentId",
                 s.first_name AS "firstName", s.last_name AS "lastName",
                 COUNT(*)::int AS invoices, SUM(d.debt) AS amount
          FROM debts d LEFT JOIN students s ON s.id = d.student_id
          WHERE d.family_id = ANY(${familyIds}::uuid[])
          GROUP BY d.family_id, d.student_id, s.first_name, s.last_name
          ORDER BY amount DESC, s.last_name NULLS LAST`
      : [];

    const first = families[0];
    const total = first?.total ?? 0;
    return {
      totalDebt: money(first?.totalDebt),
      overdueDebt: money(first?.overdueDebt),
      items: families.map(({ total: _t, totalDebt: _d, overdueDebt: _o, ...family }) => ({
        ...family,
        amount: money(family.amount),
        overdueAmount: money(family.overdueAmount),
        students: students
          .filter((row) => row.familyId === family.familyId)
          .map(({ familyId: _f, ...row }) => ({ ...row, amount: money(row.amount) })),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
