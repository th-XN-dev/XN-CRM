import { CenterStatus } from '@prisma/client';
import { centerAvailability } from './center-availability';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const center = (overrides: Partial<Parameters<typeof centerAvailability>[0]> = {}) => ({
  status: CenterStatus.ACTIVE,
  activeFrom: null,
  activeUntil: null,
  timezone: 'Asia/Tashkent',
  ...overrides,
});

describe('centerAvailability', () => {
  const now = new Date('2026-10-01T10:00:00.000Z'); // 15:00 in Tashkent

  it('status wins over the period', () => {
    expect(centerAvailability(center({ status: CenterStatus.FROZEN }), now)).toBe('FROZEN');
    expect(centerAvailability(center({ status: CenterStatus.ARCHIVED }), now)).toBe('ARCHIVED');
  });

  it('the last day of the period is still usable; the next one is not', () => {
    expect(centerAvailability(center({ activeUntil: day('2026-10-01') }), now)).toBe('ACTIVE');
    expect(centerAvailability(center({ activeUntil: day('2026-09-30') }), now)).toBe('EXPIRED');
  });

  it('a period that starts tomorrow is not usable yet', () => {
    expect(centerAvailability(center({ activeFrom: day('2026-10-02') }), now)).toBe('NOT_STARTED');
    expect(centerAvailability(center({ activeFrom: day('2026-10-01') }), now)).toBe('ACTIVE');
  });

  it('uses the center timezone, not UTC', () => {
    // 20:30 UTC on Sep 30 is already Oct 1 in Tashkent (UTC+5).
    const lateUtc = new Date('2026-09-30T20:30:00.000Z');
    expect(centerAvailability(center({ activeUntil: day('2026-09-30') }), lateUtc)).toBe('EXPIRED');
    expect(
      centerAvailability(center({ activeUntil: day('2026-09-30'), timezone: 'UTC' }), lateUtc),
    ).toBe('ACTIVE');
  });
});
