import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { parseDateOnly, startOfDayInZone, todayIn } from '../../common/utils/dates';

export { startOfDayInZone };

export const REPORT_PERIODS = ['today', 'week', 'month', 'quarter', 'year', 'custom'] as const;
export type ReportPeriodName = (typeof REPORT_PERIODS)[number];

/** Longest custom range a report accepts (keeps aggregations bounded). */
const MAX_CUSTOM_DAYS = 3 * 366;
const DAY_MS = 86_400_000;

export interface ReportPeriod {
  name: ReportPeriodName;
  timezone: string;
  /** Inclusive calendar days in the organization's timezone, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** Same days as `@db.Date` values (UTC midnight) — for date columns. */
  fromDate: Date;
  toDate: Date;
  /** Instants [start, end) — for timestamp columns, local midnight to local midnight. */
  start: Date;
  end: Date;
  days: number;
  /** Bucket size for time series: daily up to ~2 months, monthly beyond. */
  granularity: 'day' | 'month';
}

/**
 * Turns `?period=` or `?from=&to=` into concrete boundaries. "Today", weeks
 * (Monday first), months, quarters and years are those of the organization's
 * timezone, not the server's.
 */
export function resolvePeriod(
  query: { period?: ReportPeriodName; from?: string; to?: string },
  timeZone: string,
  now: Date = new Date(),
): ReportPeriod {
  const custom = query.period === 'custom' || !!query.from || !!query.to;
  let from: string;
  let to: string;
  let name: ReportPeriodName;

  if (custom) {
    if (!query.from || !query.to) {
      throw AppException.badRequest(
        ErrorCode.INVALID_DATE_RANGE,
        'A custom period needs both `from` and `to` (YYYY-MM-DD)',
      );
    }
    if (query.from > query.to) {
      throw AppException.badRequest(ErrorCode.INVALID_DATE_RANGE, '`from` must not be after `to`');
    }
    [from, to, name] = [query.from, query.to, 'custom'];
  } else {
    const named = (query.period ?? 'month') as Exclude<ReportPeriodName, 'custom'>;
    name = named;
    [from, to] = namedRange(named, todayIn(timeZone, now));
  }

  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
  if (days > MAX_CUSTOM_DAYS) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      `A report period may span at most ${MAX_CUSTOM_DAYS} days`,
    );
  }
  return {
    name,
    timezone: timeZone,
    from,
    to,
    fromDate,
    toDate,
    start: startOfDayInZone(from, timeZone),
    end: startOfDayInZone(ymd(addDays(toDate, 1)), timeZone),
    days,
    granularity: days <= 62 ? 'day' : 'month',
  };
}

/** The period's buckets ("YYYY-MM-DD" day or first-of-month), for zero-filled series. */
export function periodBuckets(period: ReportPeriod): string[] {
  const buckets: string[] = [];
  let cursor = period.fromDate;
  if (period.granularity === 'month') {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    while (cursor <= period.toDate) {
      buckets.push(ymd(cursor));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return buckets;
  }
  while (cursor <= period.toDate) {
    buckets.push(ymd(cursor));
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

function namedRange(name: Exclude<ReportPeriodName, 'custom'>, today: Date): [string, string] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (name) {
    case 'today':
      return [ymd(today), ymd(today)];
    case 'week': {
      const mondayOffset = (today.getUTCDay() + 6) % 7; // Monday = 0
      const monday = addDays(today, -mondayOffset);
      return [ymd(monday), ymd(addDays(monday, 6))];
    }
    case 'month':
      return [ymd(new Date(Date.UTC(y, m, 1))), ymd(new Date(Date.UTC(y, m + 1, 0)))];
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return [ymd(new Date(Date.UTC(y, q, 1))), ymd(new Date(Date.UTC(y, q + 3, 0)))];
    }
    case 'year':
      return [ymd(new Date(Date.UTC(y, 0, 1))), ymd(new Date(Date.UTC(y, 11, 31)))];
  }
}

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
const ymd = (date: Date): string => date.toISOString().slice(0, 10);

/** The period of the same length right before `period` (for growth comparisons). */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  const to = addDays(period.fromDate, -1);
  const from = addDays(to, -(period.days - 1));
  return resolvePeriod({ from: ymd(from), to: ymd(to) }, period.timezone);
}
