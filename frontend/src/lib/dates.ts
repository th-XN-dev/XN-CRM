/** "YYYY-MM-DD" of `date` as seen in `timeZone` (the API's calendar-date format). */
export function isoDay(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

/** Today in the organization's calendar, shifted by `days`. */
export function orgDay(timeZone: string | undefined, days = 0): string {
  return isoDay(new Date(Date.now() + days * 86_400_000), timeZone);
}

/** Adds days to a "YYYY-MM-DD" (calendar arithmetic in UTC, no DST surprises). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function startOfWeek(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** API weekday of a "YYYY-MM-DD". */
export function weekDayOf(day: string): WeekDay {
  return WEEK_DAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7] ?? 'MONDAY';
}

/** ISO instant → value of <input type="datetime-local"> (the device's local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO instant (undefined when empty). */
export function fromLocalInput(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
