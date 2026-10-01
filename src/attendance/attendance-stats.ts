import { AttendanceStatus } from '@prisma/client';

export interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** Folds a Prisma `groupBy(status)` result into fixed counters. */
export function toCounts(
  rows: { status: AttendanceStatus; _count: { _all: number } }[],
): StatusCounts {
  const counts: StatusCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof StatusCounts;
    counts[key] = row._count._all;
  }
  return counts;
}

export function totalOf(counts: StatusCounts): number {
  return counts.present + counts.absent + counts.late + counts.excused;
}

/**
 * attendancePercentage = (PRESENT + LATE) / TOTAL × 100, rounded to 2 decimals.
 * TOTAL counts every mark including EXCUSED (reported separately);
 * `null` when there are no marks yet.
 */
export function attendancePercentage(counts: StatusCounts): number | null {
  const total = totalOf(counts);
  if (total === 0) return null;
  return Math.round(((counts.present + counts.late) / total) * 10_000) / 100;
}

export const ATTENDED_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
];
