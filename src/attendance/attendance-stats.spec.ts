import { attendancePercentage, toCounts, totalOf } from './attendance-stats';

describe('attendance statistics', () => {
  it('counts statuses and computes (PRESENT + LATE) / TOTAL × 100', () => {
    const counts = toCounts([
      { status: 'PRESENT', _count: { _all: 6 } },
      { status: 'LATE', _count: { _all: 1 } },
      { status: 'ABSENT', _count: { _all: 2 } },
      { status: 'EXCUSED', _count: { _all: 1 } },
    ]);
    expect(counts).toEqual({ present: 6, absent: 2, late: 1, excused: 1 });
    expect(totalOf(counts)).toBe(10);
    expect(attendancePercentage(counts)).toBe(70);
  });

  it('rounds to two decimals and returns null without marks', () => {
    expect(attendancePercentage({ present: 2, absent: 1, late: 0, excused: 0 })).toBe(66.67);
    expect(attendancePercentage({ present: 0, absent: 0, late: 0, excused: 0 })).toBeNull();
  });
});
