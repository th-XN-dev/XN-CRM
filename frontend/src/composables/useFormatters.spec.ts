import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { useFormatters } from './useFormatters';

describe('useFormatters', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('spells Uzbek dates out (browsers lack the data) and uses “so‘m”', async () => {
    await setLocale('uz');
    const format = useFormatters();
    expect(format.day('2026-10-01T00:00:00.000Z')).toBe('1-oktabr, 2026');
    expect(format.dayShort('2026-03-08T00:00:00.000Z')).toBe('8-mar');
    expect(format.money('1250000')).toBe('1 250 000 so‘m');
  });

  it('uses the regular formats in Russian and English', async () => {
    await setLocale('ru');
    expect(useFormatters().money(450000)).toBe('450 000 сум');
    await setLocale('en');
    expect(useFormatters().money(450000)).toMatch(/UZS\s?450,000/);
    expect(useFormatters().day('2026-10-01T00:00:00.000Z')).toBe('Oct 1, 2026');
  });
});
