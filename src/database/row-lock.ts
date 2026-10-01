import { Prisma } from '@prisma/client';

type LockableTable =
  | 'students'
  | 'groups'
  | 'rooms'
  | 'teachers'
  | 'invoices'
  | 'cash_sessions'
  | 'leads'
  | 'employees'
  | 'tasks';

/**
 * `SELECT … FOR UPDATE` on tenant rows inside an interactive transaction.
 * Serializes concurrent operations on the same rows, so invariant checks
 * (one active enrollment, capacity, schedule conflicts) can't be raced.
 *
 * Lock order convention (prevents deadlocks): students → groups → rooms → teachers;
 * finance: invoices → cash_sessions; leads: locked first, before students/groups
 * (lead conversion locks the lead, then reuses the enrollment student→group order);
 * HR/tasks: tasks → employees.
 * Returns the ids that were found (and locked).
 */
export async function lockRows(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  ids: string[],
  organizationId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM ${Prisma.raw(`"${table}"`)}
    WHERE id = ANY(${ids}::uuid[]) AND organization_id = ${organizationId}::uuid
    ORDER BY id
    FOR UPDATE`;
  return rows.map((row) => row.id);
}
