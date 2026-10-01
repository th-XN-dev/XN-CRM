import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en';

const root = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path);
    return /\.(vue|ts)$/.test(name) && !name.endsWith('.spec.ts') && !name.endsWith('.gen.ts') ? [path] : [];
  });
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en,
  );
}

// t('a.b'), $t('a.b'), te('a.b'), i18n.global.t('a.b') — and template literals t(`a.b.${x}`).
const CALL = /(?:\$t|\$te|\bt|\bte)\(\s*(['`])([a-zA-Z][\w.]*(?:\$\{[^}]+\}[\w.]*)*)\1/g;

describe('translation keys used in the code', () => {
  const used: { file: string; key: string }[] = [];
  for (const file of sources(root)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(CALL)) used.push({ file: relative(root, file), key: match[2] ?? '' });
  }

  it('finds the calls (sanity)', () => {
    expect(used.length).toBeGreaterThan(200);
  });

  it('every static key exists in the English source', () => {
    const missing = used
      .filter(({ key }) => !key.includes('${'))
      .filter(({ key }) => typeof lookup(key) !== 'string')
      .map(({ file, key }) => `${key}  (${file})`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('every dynamic key starts with an existing group', () => {
    const missing = used
      .filter(({ key }) => key.includes('${'))
      .map(({ file, key }) => ({ file, prefix: key.slice(0, key.indexOf('${')).replace(/\.$/, '') }))
      .filter(({ prefix }) => prefix && typeof lookup(prefix) !== 'object')
      .map(({ file, prefix }) => `${prefix}.*  (${file})`);
    expect([...new Set(missing)]).toEqual([]);
  });
});

/** Example values in placeholders and key hints are not UI text. */
const ALLOWED_LITERALS = new Set(['TRM', 'ENG', 'KIDS', 'jony', 'https://…', 'Esc']);

describe('no hard-coded UI text in templates', () => {
  it('every visible text and accessible label goes through i18n', () => {
    const offenders: string[] = [];
    for (const file of sources(root).filter((f) => f.endsWith('.vue'))) {
      const source = readFileSync(file, 'utf8');
      const template = /<template>([\s\S]*)<\/template>\s*$/.exec(source)?.[1] ?? '';
      const text = template.replace(/\{\{[\s\S]*?\}\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
      for (const match of text.matchAll(/>([^<>]+)</g)) {
        const value = (match[1] ?? '').trim();
        if (/[A-Za-zА-Яа-я]{2,}/.test(value) && !ALLOWED_LITERALS.has(value)) offenders.push(`${relative(root, file)}: ${value}`);
      }
      for (const match of template.matchAll(/\s(placeholder|aria-label|title|label|alt)="([^"]*)"/g)) {
        const value = match[2] ?? '';
        if (/[A-Za-zА-Яа-я]{3,}/.test(value) && !ALLOWED_LITERALS.has(value)) offenders.push(`${relative(root, file)}: ${match[1]}="${value}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
