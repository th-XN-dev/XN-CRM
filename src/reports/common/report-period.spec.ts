import { AppException } from '../../common/errors/app.exception';
import { periodBuckets, resolvePeriod, startOfDayInZone } from './report-period';

const TASHKENT = 'Asia/Tashkent'; // UTC+5, no DST
// 2026-09-30 21:00 UTC is already Thursday 2026-10-01 in Tashkent.
const NOW = new Date('2026-09-30T21:00:00Z');

describe('report periods', () => {
  it('uses the organization calendar for named periods', () => {
    expect(resolvePeriod({ period: 'today' }, TASHKENT, NOW)).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-01',
      days: 1,
      start: new Date('2026-09-30T19:00:00Z'),
      end: new Date('2026-10-01T19:00:00Z'),
    });
    expect(resolvePeriod({ period: 'week' }, TASHKENT, NOW)).toMatchObject({
      from: '2026-09-28', // Monday
      to: '2026-10-04',
    });
    expect(resolvePeriod({}, TASHKENT, NOW)).toMatchObject({
      name: 'month',
      from: '2026-10-01',
      to: '2026-10-31',
      granularity: 'day',
    });
    expect(resolvePeriod({ period: 'quarter' }, TASHKENT, NOW)).toMatchObject({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    expect(resolvePeriod({ period: 'year' }, TASHKENT, NOW)).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
      granularity: 'month',
    });
  });

  it('custom ranges need both ends, in order, bounded', () => {
    expect(resolvePeriod({ from: '2026-09-01', to: '2026-09-30' }, TASHKENT, NOW)).toMatchObject({
      name: 'custom',
      days: 30,
    });
    expect(() => resolvePeriod({ from: '2026-09-01' }, TASHKENT, NOW)).toThrow(AppException);
    expect(() => resolvePeriod({ from: '2026-09-02', to: '2026-09-01' }, TASHKENT, NOW)).toThrow(
      AppException,
    );
    expect(() => resolvePeriod({ from: '2020-01-01', to: '2026-01-01' }, TASHKENT, NOW)).toThrow(
      AppException,
    );
  });

  it('local midnight is DST-aware', () => {
    // Berlin switches to summer time on 2026-03-29.
    expect(startOfDayInZone('2026-03-28', 'Europe/Berlin')).toEqual(
      new Date('2026-03-27T23:00:00Z'),
    );
    expect(startOfDayInZone('2026-03-30', 'Europe/Berlin')).toEqual(
      new Date('2026-03-29T22:00:00Z'),
    );
  });

  it('builds zero-fill buckets', () => {
    const month = resolvePeriod({ from: '2026-09-29', to: '2026-10-02' }, TASHKENT, NOW);
    expect(periodBuckets(month)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    const year = resolvePeriod({ from: '2026-01-15', to: '2026-04-02' }, TASHKENT, NOW);
    expect(periodBuckets(year)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });
});
