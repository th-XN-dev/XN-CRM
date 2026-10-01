import { type Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { parseDateOnly, startOfDayInZone } from './dates';

interface DayRange {
  from?: string;
  to?: string;
}

/** Inclusive `from`/`to` (YYYY-MM-DD) on a `@db.Date` column. */
export function dateRangeFilter(range: DayRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  assertOrdered(range);
  return {
    ...(range.from && { gte: parseDateOnly(range.from) }),
    ...(range.to && { lte: parseDateOnly(range.to) }),
  };
}

/**
 * Inclusive calendar days on a timestamp column, in the organization's
 * timezone: [from 00:00 local, to+1 00:00 local).
 */
export function dayRangeFilter(
  range: DayRange,
  timeZone: string,
): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  assertOrdered(range);
  let end: Date | undefined;
  if (range.to) {
    const next = parseDateOnly(range.to);
    next.setUTCDate(next.getUTCDate() + 1);
    end = startOfDayInZone(next.toISOString().slice(0, 10), timeZone);
  }
  return {
    ...(range.from && { gte: startOfDayInZone(range.from, timeZone) }),
    ...(end && { lt: end }),
  };
}

function assertOrdered(range: DayRange): void {
  if (range.from && range.to && range.from > range.to) {
    throw AppException.badRequest(ErrorCode.INVALID_DATE_RANGE, '`from` must not be after `to`');
  }
}
