import { type Prisma } from '@prisma/client';
import { type Money, money, ZERO } from './money';

export interface InvoiceBalance {
  /** Σ payments. */
  paid: Money;
  /** Σ refunds. */
  refunded: Money;
}

type Db = Pick<Prisma.TransactionClient, 'payment' | 'refund'>;

/**
 * Payment/refund totals for a set of invoices in two aggregate queries.
 * Balances are never stored: this is the single place they are computed from history.
 */
export async function loadBalances(
  db: Db,
  invoiceIds: string[],
): Promise<Map<string, InvoiceBalance>> {
  const balances = new Map<string, InvoiceBalance>(
    invoiceIds.map((id) => [id, { paid: ZERO, refunded: ZERO }]),
  );
  if (invoiceIds.length === 0) return balances;

  const [payments, refunds] = await Promise.all([
    db.payment.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds } },
      _sum: { amount: true },
    }),
    db.refund.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds } },
      _sum: { amount: true },
    }),
  ]);
  for (const row of payments) balances.get(row.invoiceId)!.paid = money(row._sum.amount);
  for (const row of refunds) balances.get(row.invoiceId)!.refunded = money(row._sum.amount);
  return balances;
}

/** Net money kept for the invoice: payments − refunds. */
export function netPaid(balance: InvoiceBalance): Money {
  return balance.paid.minus(balance.refunded);
}

/** debt = finalAmount − (payments − refunds). A refund re-opens debt. */
export function debtOf(finalAmount: Money, balance: InvoiceBalance): Money {
  return finalAmount.minus(netPaid(balance));
}
