import { z } from 'zod';
import { i18n } from '@/i18n';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

/**
 * Zod messages in the current UI language, resolved when a form validates
 * (so schemas can be module constants and still follow a language switch).
 */
export function installValidationMessages(): void {
  z.setErrorMap((issue, context) => {
    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        if (issue.received === 'undefined' || issue.received === 'null') return { message: t('validation.required') };
        break;
      case z.ZodIssueCode.too_small:
        if (issue.type === 'string') {
          return { message: issue.minimum === 1 ? t('validation.required') : t('validation.min', { min: issue.minimum }) };
        }
        if (issue.type === 'number') return { message: t('validation.minNumber', { min: issue.minimum }) };
        if (issue.type === 'array') return { message: t('validation.required') };
        break;
      case z.ZodIssueCode.too_big:
        if (issue.type === 'string') return { message: t('validation.max', { max: issue.maximum }) };
        if (issue.type === 'number') return { message: t('validation.maxNumber', { max: issue.maximum }) };
        break;
      case z.ZodIssueCode.invalid_string:
        if (issue.validation === 'email') return { message: t('validation.email') };
        if (issue.validation === 'uuid') return { message: t('validation.required') };
        break;
      default:
        break;
    }
    return { message: context.defaultError };
  });
}

/** Required text (trimmed). Empty → "required", too short → "at least N". */
export const zText = (max = 120, min = 1) => z.string().trim().min(1).min(min).max(max);

/** Optional text: an empty field is sent as `undefined` (not ""). */
export const zOptionalText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/**
 * Uzbek-friendly phone: "90 123 45 67", "998901234567" or "+998 90 123-45-67"
 * all become "+998901234567". Other countries need the leading "+".
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 9 && !trimmed.startsWith('+')) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export const zPhone = () =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value, context) => {
      const phone = normalizePhone(value);
      if (!phone) context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.phone') });
      return phone ?? value;
    });

export const zOptionalPhone = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      const phone = normalizePhone(value);
      if (!phone) context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.phone') });
      return phone ?? value;
    });

export const zOptionalEmail = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      if (!z.string().email().safeParse(value).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.email') });
      }
      return value;
    });

/** A chosen id (select / picker). */
export const zId = () => z.string().refine((value) => value.length > 0, () => ({ message: t('validation.choose') }));
export const zOptionalId = () =>
  z
    .string()
    .optional()
    .transform((value) => value || undefined);

/** "YYYY-MM-DD" from a date input. */
export const zDate = () =>
  z
    .string()
    .refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      (value) => ({ message: t(value ? 'validation.date' : 'validation.required') }),
    );
export const zOptionalDate = () =>
  z
    .string()
    .optional()
    .transform((value) => value || undefined);

/** Digits from <MoneyInput> → number; `min` 1 by default (a positive amount). */
export const zMoney = (min = 1) =>
  z
    .string()
    .transform((value, context) => {
      if (!value) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.required') });
        return 0;
      }
      const amount = Number(value);
      if (amount < min) context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.minNumber', { min }) });
      return amount;
    });

export const zOptionalMoney = () =>
  z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined));

/** A small whole number from a text/number input (capacity, order). */
export const zInt = (min: number, max: number) =>
  z
    .string()
    .transform((value, context) => {
      const number = Number(value.trim());
      if (value === '' || !Number.isInteger(number)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.wholeNumber') });
      } else if (number < min) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.minNumber', { min }) });
      } else if (number > max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.maxNumber', { max }) });
      }
      return number;
    });
