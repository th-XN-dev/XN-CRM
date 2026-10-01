import { beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { installValidationMessages, normalizePhone, zMoney, zOptionalDate, zOptionalText, zText } from './validation';

beforeAll(async () => {
  await setLocale('en');
  installValidationMessages();
});

describe('validation helpers', () => {
  it('normalizes the ways people type Uzbek phone numbers', () => {
    expect(normalizePhone('90 123 45 67')).toBe('+998901234567');
    expect(normalizePhone('998901234567')).toBe('+998901234567');
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
    expect(normalizePhone('+7 912 345 67 89')).toBe('+79123456789');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('an empty required field says "required", not "at least N"', () => {
    const result = zText(120, 2).safeParse('  ');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('This field is required');
    expect(zText(120, 2).safeParse('A').error?.issues[0]?.message).toBe('Must be at least 2 characters');
  });

  it('optional fields accept empty and missing values and send undefined', () => {
    expect(zOptionalText().parse('')).toBeUndefined();
    expect(zOptionalText().parse(undefined)).toBeUndefined();
    expect(zOptionalDate().parse(undefined)).toBeUndefined();
    expect(zOptionalDate().parse('2026-10-01')).toBe('2026-10-01');
  });

  it('money comes from digits and must be positive', () => {
    expect(zMoney().parse('450000')).toBe(450000);
    expect(zMoney().safeParse('0').success).toBe(false);
    expect(zMoney().safeParse('').error?.issues[0]?.message).toBe('This field is required');
  });
});
