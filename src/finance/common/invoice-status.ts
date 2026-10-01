import { InvoiceStatus, type Prisma } from '@prisma/client';
import { type Money, ZERO } from './money';

/** API-level status: the stored lifecycle plus the derived OVERDUE. */
export const InvoiceApiStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;

export type InvoiceApiStatus = (typeof InvoiceApiStatus)[keyof typeof InvoiceApiStatus];

const UNPAID: InvoiceStatus[] = [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL];

/** Stored status implied by how much of `finalAmount` is (net) paid. */
export function settledStatus(finalAmount: Money, netPaid: Money): InvoiceStatus {
  if (netPaid.gte(finalAmount)) return InvoiceStatus.PAID;
  return netPaid.gt(ZERO) ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING;
}

/** OVERDUE = not fully paid and past the due date (organization calendar). */
export function effectiveStatus(
  status: InvoiceStatus,
  dueDate: Date,
  today: Date,
): InvoiceApiStatus {
  return UNPAID.includes(status) && dueDate < today ? InvoiceApiStatus.OVERDUE : status;
}

/** Translates an API status filter into a `where` on stored columns. */
export function statusWhere(
  status: InvoiceApiStatus | undefined,
  today: Date,
): Prisma.InvoiceWhereInput {
  switch (status) {
    case undefined:
      return {};
    case InvoiceApiStatus.OVERDUE:
      return { status: { in: UNPAID }, dueDate: { lt: today } };
    case InvoiceApiStatus.PENDING:
    case InvoiceApiStatus.PARTIAL:
      return { status, dueDate: { gte: today } };
    default:
      return { status };
  }
}

export function overdueWhere(overdue: boolean | undefined, today: Date): Prisma.InvoiceWhereInput {
  if (overdue === undefined) return {};
  return overdue
    ? { status: { in: UNPAID }, dueDate: { lt: today } }
    : { NOT: { status: { in: UNPAID }, dueDate: { lt: today } } };
}
