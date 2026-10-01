import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Atomically bumps a per-organization counter and returns the new value.
 *
 * Gap-free: the increment happens inside the caller's transaction, so if the
 * transaction rolls back the number is released (never burned). `ON CONFLICT`
 * makes the first use of a key insert `1` and every later use `value + 1` in a
 * single statement, so concurrent callers serialize on the row lock instead of
 * racing to the same number.
 */
export async function nextCounter(tx: Tx, organizationId: string, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "document_counters" ("organization_id", "key", "value")
    VALUES (${organizationId}::uuid, ${key}, 1)
    ON CONFLICT ("organization_id", "key")
    DO UPDATE SET "value" = "document_counters"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

/** e.g. (2026, 42) → "INV-2026-000042". */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(6, '0')}`;
}

/** The counter key an invoice number is drawn from, e.g. "invoice:2026". */
export function invoiceCounterKey(year: number): string {
  return `invoice:${year}`;
}
