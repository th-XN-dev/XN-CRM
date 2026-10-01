/**
 * Calendar-date helpers for `@db.Date` columns. Dates travel as "YYYY-MM-DD"
 * and are stored as UTC midnight, so no timezone shift can move them a day.
 */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** "Today" as seen in the organization's timezone (e.g. Asia/Tashkent), as a date-only value. */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  return parseDateOnly(new Intl.DateTimeFormat('en-CA', { timeZone }).format(now));
}

/** The UTC instant of local midnight of `day` ("YYYY-MM-DD") in `timeZone` (DST-safe). */
export function startOfDayInZone(day: string, timeZone: string): Date {
  const guess = parseDateOnly(day).getTime();
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Today's local-midnight bounds in `timeZone`, as instants: [start, end). For timestamp columns. */
export function localDayBounds(
  timeZone: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const today = todayIn(timeZone, now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return {
    start: startOfDayInZone(today.toISOString().slice(0, 10), timeZone),
    end: startOfDayInZone(tomorrow.toISOString().slice(0, 10), timeZone),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (e.g. +5h for Asia/Tashkent). */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of a local wall-clock time ("YYYY-MM-DD" + "HH:MM") in `timeZone` (DST-safe). */
export function instantInZone(day: string, time: string, timeZone: string): Date {
  const guess = new Date(`${day}T${time}:00.000Z`).getTime();
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export const isoWeekday = (date: Date): number => ((date.getUTCDay() + 6) % 7) + 1;
