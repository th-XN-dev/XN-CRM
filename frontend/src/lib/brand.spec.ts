import { describe, expect, it } from 'vitest';
import { applyBrand, brandCssVariables } from './brand';
import { contrastRatio } from './color';

describe('brand css variables', () => {
  it('keeps the exact brand color and a readable foreground', () => {
    const vars = brandCssVariables('#38b266', '#4F46E5');
    expect(vars['--brand-primary']).toBe('#38B266');
    expect(contrastRatio(vars['--brand-primary']!, vars['--brand-primary-fg']!)).toBeGreaterThanOrEqual(4.5);
    expect(Object.keys(vars)).toContain('--brand-950');
  });

  it('adapts colors that would vanish on the background', () => {
    expect(brandCssVariables('#FEF9C3', '#4F46E5')['--brand-primary']).not.toBe('#FEF9C3');
    expect(brandCssVariables('#0B1026', '#4F46E5')['--brand-primary-dark']).not.toBe('#0B1026');
  });

  it('falls back when the color is invalid and writes to the element', () => {
    expect(brandCssVariables('not-a-color', '#4F46E5')['--brand-primary']).toBe('#4F46E5');
    const el = document.createElement('div');
    applyBrand(el, '#E11D48', '#4F46E5');
    expect(el.style.getPropertyValue('--brand-primary')).toBe('#E11D48');
  });
});
