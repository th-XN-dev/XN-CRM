import { describe, expect, it } from 'vitest';
import {
  buildPalette,
  contrastRatio,
  isHexColor,
  lightnessOf,
  normalizeHex,
  PALETTE_STEPS,
  readableOn,
} from './color';

describe('brand color', () => {
  it('validates and normalizes hex', () => {
    expect(isHexColor('#4f46e5')).toBe(true);
    expect(isHexColor('4F46E5')).toBe(true);
    expect(isHexColor('indigo')).toBe(false);
    expect(normalizeHex(' 38b266 ')).toBe('#38B266');
  });

  it('builds a monotonic 50–950 palette for any brand', () => {
    for (const brand of ['#4F46E5', '#38B266', '#E11D48', '#111827', '#FACC15']) {
      const palette = buildPalette(brand);
      const lightness = PALETTE_STEPS.map((step) => lightnessOf(palette[step]));
      for (let i = 1; i < lightness.length; i++) {
        expect(lightness[i]).toBeLessThan(lightness[i - 1] as number);
      }
      for (const step of PALETTE_STEPS) expect(palette[step]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('picks a readable foreground (WCAG)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(readableOn('#4F46E5')).toBe('#FFFFFF');
    expect(readableOn('#FACC15')).toBe('#0B0B0F');
    for (const brand of ['#4F46E5', '#38B266', '#FACC15', '#0EA5E9']) {
      expect(contrastRatio(brand, readableOn(brand))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
