import { AppException } from '../errors/app.exception';
import { dateRangeFilter, dayRangeFilter } from './date-range';

describe('date range filters', () => {
  it('date columns compare calendar days', () => {
    expect(dateRangeFilter({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      gte: new Date('2026-09-01T00:00:00Z'),
      lte: new Date('2026-09-30T00:00:00Z'),
    });
    expect(dateRangeFilter({})).toBeUndefined();
  });

  it('timestamp columns use local midnights of the organization', () => {
    // Asia/Tashkent is UTC+5: a local day starts at 19:00 UTC the day before.
    expect(dayRangeFilter({ from: '2026-10-01', to: '2026-10-01' }, 'Asia/Tashkent')).toEqual({
      gte: new Date('2026-09-30T19:00:00Z'),
      lt: new Date('2026-10-01T19:00:00Z'),
    });
    expect(dayRangeFilter({ to: '2026-10-01' }, 'UTC')).toEqual({
      lt: new Date('2026-10-02T00:00:00Z'),
    });
  });

  it('rejects reversed ranges', () => {
    expect(() => dayRangeFilter({ from: '2026-10-02', to: '2026-10-01' }, 'UTC')).toThrow(
      AppException,
    );
  });
});
