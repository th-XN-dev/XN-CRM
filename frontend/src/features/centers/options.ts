import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { i18n } from '@/i18n';
import { isHexColor, normalizeHex } from '@/lib/color';

/** Timezones and currencies centers in the region use; the API accepts any valid IANA zone / ISO 4217 code. */
export const TIMEZONES = ['Asia/Tashkent', 'Asia/Samarkand', 'Asia/Almaty', 'Asia/Bishkek', 'Asia/Dushanbe', 'Asia/Ashgabat', 'Europe/Moscow', 'UTC'] as const;
export const CURRENCIES = ['UZS', 'USD', 'EUR', 'KZT', 'KGS', 'TJS', 'RUB'] as const;
export const LANGUAGES = ['uz', 'ru', 'en'] as const;

export function useRegionalOptions() {
  const { t } = useI18n();
  const toOptions = (values: readonly string[]): SelectOption[] => values.map((value) => ({ value, label: value }));
  return {
    timezones: toOptions(TIMEZONES),
    currencies: toOptions(CURRENCIES),
    languages: computed<SelectOption[]>(() => LANGUAGES.map((value) => ({ value, label: t(`language.${value}`) }))),
  };
}

const t = (key: string) => i18n.global.t(key);

/** "" or a URL (logo, favicon). */
export const zOptionalUrl = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), () => ({ message: t('validation.url') }))
    .transform((v) => v || undefined);

export const zHexColor = () =>
  z
    .string()
    .trim()
    .refine(isHexColor, () => ({ message: t('validation.hexColor') }))
    .transform(normalizeHex);

export const zOptionalHexColor = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || isHexColor(v), () => ({ message: t('validation.hexColor') }))
    .transform((v) => (v ? normalizeHex(v) : undefined));

/** Lowercase Latin, digits, single dashes (the API's slug rule). */
export const zOptionalSlug = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length >= 3 && v.length <= 80), () => ({
      message: t('owner.centers.slugHint'),
    }))
    .transform((v) => v || undefined);
