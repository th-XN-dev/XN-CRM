import { instantInZone, isoWeekday, parseDateOnly, todayIn } from './dates';

describe('dates', () => {
  it('parses calendar dates as UTC midnight', () => {
    expect(parseDateOnly('2026-03-01').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('computes today in the given timezone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T20:30:00Z')); // 01:30 on Mar 2 in Tashkent
    expect(todayIn('Asia/Tashkent').toISOString()).toBe('2026-03-02T00:00:00.000Z');
    expect(todayIn('UTC').toISOString()).toBe('2026-03-01T00:00:00.000Z');
    jest.useRealTimers();
  });
});

describe('instantInZone', () => {
  it('turns a Tashkent wall-clock time into the UTC instant', () => {
    expect(instantInZone('2026-10-01', '09:00', 'Asia/Tashkent').toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    );
  });
  it('isoWeekday: Monday is 1, Sunday is 7', () => {
    expect(isoWeekday(new Date('2026-09-28T00:00:00Z'))).toBe(1);
    expect(isoWeekday(new Date('2026-10-04T00:00:00Z'))).toBe(7);
  });
});
