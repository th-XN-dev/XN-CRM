import { Prisma } from '@prisma/client';
import { sanitizeForAudit } from './audit-sanitizer';

describe('audit sanitizer', () => {
  it('drops secrets at any depth, by key name', () => {
    expect(
      sanitizeForAudit({
        name: 'Ali',
        password: 'p',
        passwordHash: 'h',
        nested: { refreshToken: 'r', accessToken: 'a', apiKey: 'k', clientSecret: 's', ok: 1 },
        list: [{ token: 't', code: 'TRM' }],
      }),
    ).toEqual({ name: 'Ali', nested: { ok: 1 }, list: [{ code: 'TRM' }] });
  });

  it('serializes decimals and dates, drops undefined', () => {
    expect(
      sanitizeForAudit({
        amount: new Prisma.Decimal('450000.5'),
        at: new Date('2026-10-01T00:00:00Z'),
        gone: undefined,
      }),
    ).toEqual({ amount: '450000.5', at: '2026-10-01T00:00:00.000Z' });
  });

  it('bounds size', () => {
    const long = 'x'.repeat(5_000);
    expect((sanitizeForAudit({ long }) as { long: string }).long).toHaveLength(1_001);
    const list = sanitizeForAudit(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
    expect(list).toHaveLength(51);
    const deep = sanitizeForAudit({ a: { b: { c: { d: { e: { f: 1 } } } } } });
    expect(JSON.stringify(deep)).toContain('[depth limit]');
    const huge = sanitizeForAudit(Array.from({ length: 50 }, () => ({ v: 'y'.repeat(900) })));
    expect(huge).toMatchObject({ truncated: true });
    expect(sanitizeForAudit(undefined)).toBeNull();
  });
});
