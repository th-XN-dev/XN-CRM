import { describe, expect, it } from 'vitest';
import en from './locales/en';
import ru from './locales/ru';
import uz from './locales/uz';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

// Unique names: plural forms repeat {count} a different number of times per language.
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('translations', () => {
  const source = keys(en).sort();

  it.each([
    ['uz', uz],
    ['ru', ru],
  ])('%s has exactly the English keys', (_name, messages) => {
    expect(keys(messages).sort()).toEqual(source);
  });

  it.each([
    ['uz', uz],
    ['ru', ru],
  ])('%s keeps every {placeholder}', (_name, messages) => {
    for (const key of source) {
      const read = (m: unknown) =>
        key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], m);
      expect({ key, p: placeholders(read(messages) as string) }).toEqual({
        key,
        p: placeholders(read(en) as string),
      });
    }
  });

  it('has no empty strings', () => {
    for (const messages of [en, ru, uz]) {
      const walk = (node: unknown): void => {
        if (typeof node === 'string') expect(node.trim()).not.toBe('');
        else Object.values(node as object).forEach(walk);
      };
      walk(messages);
    }
  });
});

describe('translations compile in vue-i18n', () => {
  // Characters like @ | { } have meaning in vue-i18n messages; a bad one breaks a whole page.
  it.each([
    ['en', en],
    ['uz', uz],
    ['ru', ru],
  ])('%s: every message renders', async (locale, messages) => {
    const { createI18n } = await import('vue-i18n');
    const errors: string[] = [];
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: { [locale]: messages },
      messageCompiler: undefined,
      missingWarn: false,
      fallbackWarn: false,
    });
    for (const key of keys(messages)) {
      try {
        const text = i18n.global.t(key, { count: 3, name: 'Ali', role: 'Owner', min: 2, max: 9, id: 'x', from: 1, to: 2, total: 3, page: 1, pages: 2 });
        if (!text || text === key) errors.push(`${key}: not rendered`);
      } catch (error) {
        errors.push(`${key}: ${String(error)}`);
      }
    }
    expect(errors).toEqual([]);
  });
});
