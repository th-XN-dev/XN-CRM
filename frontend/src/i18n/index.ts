import { createI18n } from 'vue-i18n';
import { appConfig } from '@/app/config/app.config';
import type { Locale } from '@/types/domain';
import uz from './locales/uz';
import type { MessageSchema } from './schema';

/** Russian plural forms: 0 → one, 1 → few, 2 → many (messages "форма1 | форма2 | форма5"). */
function russianPlural(choice: number, choicesLength: number): number {
  if (choicesLength < 3) return Math.min(choice, choicesLength - 1);
  const n = Math.abs(choice) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return 2;
  if (last === 1) return 0;
  if (last >= 2 && last <= 4) return 1;
  return 2;
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: appConfig.defaultLocale,
  // Every locale has every key (locales.spec), so the always-loaded default is a safe fallback.
  fallbackLocale: appConfig.defaultLocale,
  messages: { uz } as Record<Locale, MessageSchema>,
  missingWarn: import.meta.env.DEV,
  // "1 ученик / 2 ученика / 5 учеников": `t(key, { count }, count)` with "one | few | many".
  pluralRules: { ru: russianPlural },
  fallbackWarn: false,
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (appConfig.locales as readonly string[]).includes(value);
}

/** Only Uzbek ships in the main bundle; the other languages load the first time they are chosen. */
const loaders: Record<Locale, () => Promise<{ default: MessageSchema }>> = {
  uz: () => Promise.resolve({ default: uz }),
  ru: () => import('./locales/ru'),
  en: () => import('./locales/en'),
};
const loaded = new Set<Locale>(['uz']);

/** Switches the UI language in place (no reload) and keeps <html lang> in sync. */
export async function setLocale(locale: Locale): Promise<void> {
  if (!loaded.has(locale)) {
    i18n.global.setLocaleMessage(locale, (await loaders[locale]()).default);
    loaded.add(locale);
  }
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
}

/** HTTP status → message used when a backend code has no translation of its own. */
const STATUS_FALLBACK: Record<number, string> = {
  0: 'NETWORK_ERROR',
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'SERVICE_UNAVAILABLE',
};

/**
 * The one place that turns a failure into words: the backend code when we
 * know it, else the HTTP status class, else a generic sentence. Never shows
 * raw server text, `undefined` or "Error".
 */
export function errorMessage(code: string | undefined, status?: number): string {
  const translate = (key: string) => (i18n.global.te(`errors.${key}`) ? i18n.global.t(`errors.${key}`) : null);
  const byStatus = status === undefined ? undefined : (STATUS_FALLBACK[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : undefined));
  return (code && translate(code)) ?? (byStatus && translate(byStatus)) ?? i18n.global.t('errors.UNKNOWN');
}
