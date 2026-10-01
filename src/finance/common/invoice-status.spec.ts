import { Prisma } from '@prisma/client';
import { debtOf } from './invoice-balances';
import { effectiveStatus, settledStatus, statusWhere } from './invoice-status';

const d = (v: number) => new Prisma.Decimal(v);

describe('invoice status', () => {
  it('derives PENDING / PARTIAL / PAID from net paid', () => {
    expect(settledStatus(d(500_000), d(0))).toBe('PENDING');
    expect(settledStatus(d(500_000), d(200_000))).toBe('PARTIAL');
    expect(settledStatus(d(500_000), d(500_000))).toBe('PAID');
    expect(settledStatus(d(0), d(0))).toBe('PAID');
  });

  it('OVERDUE only for unpaid invoices past due', () => {
    const today = new Date('2026-09-30T00:00:00Z');
    const past = new Date('2026-09-01T00:00:00Z');
    expect(effectiveStatus('PARTIAL', past, today)).toBe('OVERDUE');
    expect(effectiveStatus('PAID', past, today)).toBe('PAID');
    expect(effectiveStatus('PENDING', today, today)).toBe('PENDING');
    expect(statusWhere('OVERDUE', today)).toEqual({
      status: { in: ['PENDING', 'PARTIAL'] },
      dueDate: { lt: today },
    });
  });

  it('debt = final − (payments − refunds)', () => {
    expect(debtOf(d(500_000), { paid: d(500_000), refunded: d(100_000) }).toNumber()).toBe(100_000);
  });
});
