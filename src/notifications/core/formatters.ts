import { type Prisma } from '@prisma/client';

/** "450000.5" → "450 000.50" (plain text for templates). */
export function formatMoney(value: Prisma.Decimal | string | number): string {
  const [whole, fraction] = Number(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? grouped : `${grouped}.${fraction}`;
}

/** Calendar date "YYYY-MM-DD" (`@db.Date` values are UTC midnight). */
export const formatDate = (value: Date): string => value.toISOString().slice(0, 10);

/** "YYYY-MM-DD HH:mm" in the organization's timezone. */
export function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export const personName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`;
