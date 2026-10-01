import { computed } from 'vue';
import { i18n } from '@/i18n';
import { useSessionStore } from '@/stores/session.store';

const INTL_LOCALE = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' } as const;

/**
 * Browsers ship partial Uzbek date data ("2026 M10 1"), so Uzbek dates are
 * spelled out here: "1-oktabr, 2026", "1-okt".
 */
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const UZ_MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
/** Local calendar parts of an instant in a timezone. */
function parts(value: string | Date, timeZone: string | undefined): { year: number; month: number; day: number; time: string } {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '0';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), time: `${get('hour')}:${get('minute')}` };
}

/** Currency names people use in speech; other currencies use the ISO code. */
const CURRENCY_WORD: Record<string, Partial<Record<keyof typeof INTL_LOCALE, string>>> = {
  UZS: { uz: 'so‘m', ru: 'сум' },
};

/** Numbers, money and dates in the UI language and the organization's currency/timezone. */
export function useFormatters() {
  const locale = i18n.global.locale;
  const session = useSessionStore();
  const intlLocale = computed(() => INTL_LOCALE[locale.value as keyof typeof INTL_LOCALE] ?? 'en-US');
  const timeZone = computed(() => session.organization?.timezone);

  /** Uzbek groups thousands with spaces ("1 250 000"); browsers often fall back to commas. */
  function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
    if (locale.value === 'uz') {
      return new Intl.NumberFormat('en-US', options).format(value).replace(/,/g, '\u00a0').replace('.', ',');
    }
    return new Intl.NumberFormat(intlLocale.value, options).format(value);
  }

  function formatDay(value: string | Date, zone: string | undefined): string {
    if (locale.value === 'uz') {
      const p = parts(value, zone);
      return `${p.day}-${UZ_MONTHS[p.month - 1]}, ${p.year}`;
    }
    return new Intl.DateTimeFormat(intlLocale.value, { dateStyle: 'medium', timeZone: zone }).format(new Date(value));
  }

  return {
    number: (value: number) => formatNumber(value),
    percent: (value: number) =>
      formatNumber(value, { maximumFractionDigits: 1 }) + '%',
    /** "so‘m" / "сум" / "UZS" — the label next to amount inputs. */
    currency: () => {
      const currency = session.organization?.currency ?? 'UZS';
      return CURRENCY_WORD[currency]?.[locale.value as keyof typeof INTL_LOCALE] ?? currency;
    },
    /** "1 250 000 so‘m" — whole sums, the currency word people use (the center's currency by default). */
    money: (value: string | number, currencyCode?: string) => {
      const currency = currencyCode ?? session.organization?.currency ?? 'UZS';
      const word = CURRENCY_WORD[currency]?.[locale.value as keyof typeof INTL_LOCALE];
      if (word) {
        return `${formatNumber(Number(value), { maximumFractionDigits: 0 })}\u00a0${word}`;
      }
      return new Intl.NumberFormat(intlLocale.value, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
    },
    /** An instant (createdAt, paymentDate…) as a date in the organization's timezone. */
    date: (value: string | Date) => formatDay(value, timeZone.value),
    /** A calendar date (`@db.Date`: birthDate, dueDate…) — stored as UTC midnight, shown as is. */
    day: (value: string | Date) => formatDay(value, 'UTC'),
    dayShort: (value: string | Date) => {
      if (locale.value === 'uz') {
        const p = parts(value, 'UTC');
        return `${p.day}-${UZ_MONTHS_SHORT[p.month - 1]}`;
      }
      return new Intl.DateTimeFormat(intlLocale.value, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value));
    },
    weekday: (value: string | Date) =>
      locale.value === 'uz'
        ? (UZ_WEEKDAYS[new Date(value).getUTCDay()] ?? '')
        : new Intl.DateTimeFormat(intlLocale.value, { weekday: 'long', timeZone: 'UTC' }).format(new Date(value)),
    dateTime: (value: string | Date) => `${formatDay(value, timeZone.value)}, ${parts(value, timeZone.value).time}`,
    /** "5 min ago", "yesterday"… */
    relative: (value: string | Date) => {
      const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
      const format = new Intl.RelativeTimeFormat(intlLocale.value, { numeric: 'auto' });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
      ];
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
      }
      return format.format(0, 'minute');
    },
  };
}
