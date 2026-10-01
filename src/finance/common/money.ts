import { Prisma } from '@prisma/client';

/**
 * Money is always `Prisma.Decimal` inside the backend (never JS floats) and
 * serializes to a string in JSON (e.g. "450000" or "1250.5").
 */
export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

export function money(value: number | string | Money | null | undefined): Money {
  return value === null || value === undefined ? ZERO : new Prisma.Decimal(value);
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}
