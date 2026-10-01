/**
 * Wall-clock times for `@db.Time` columns ("HH:MM", organization timezone).
 * Prisma represents TIME as a Date on 1970-01-01 UTC; these helpers keep that
 * detail out of services and API responses.
 */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

export function formatTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}
