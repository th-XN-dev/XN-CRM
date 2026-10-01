import { buildPalette, isHexColor, lightnessOf, normalizeHex, PALETTE_STEPS, readableOn } from './color';

/**
 * CSS custom properties for a brand color. The exact brand color is used as
 * the primary when it reads well on the theme's background; otherwise a
 * palette step of the same hue is used (e.g. a pale yellow on white, or a
 * near-black navy on the dark theme).
 */
export function brandCssVariables(color: string, fallback: string, secondary?: string | null): Record<string, string> {
  const hex = isHexColor(color) ? normalizeHex(color) : normalizeHex(fallback);
  const palette = buildPalette(hex);
  const lightness = lightnessOf(hex);

  const lightPrimary = lightness > 0.82 ? palette[600] : hex;
  const darkPrimary = lightness < 0.5 ? palette[400] : hex;

  const variables: Record<string, string> = {
    '--brand-primary': lightPrimary,
    '--brand-primary-fg': readableOn(lightPrimary),
    '--brand-primary-dark': darkPrimary,
    '--brand-primary-dark-fg': readableOn(darkPrimary),
  };
  for (const step of PALETTE_STEPS) variables[`--brand-${step}`] = palette[step];
  // The second accent tints decorative surfaces only (background glow), never text or
  // controls — so no secondary color can ever break contrast.
  const accent = secondary && isHexColor(secondary) ? buildPalette(normalizeHex(secondary)) : palette;
  variables['--brand-accent-200'] = accent[200];
  variables['--brand-accent-900'] = accent[900];
  return variables;
}

/** True when the color is too pale to be used as-is for buttons on white (a darker step is used instead). */
export function needsContrastFallback(color: string): boolean {
  return isHexColor(color) && lightnessOf(normalizeHex(color)) > 0.82;
}

export function applyBrand(root: HTMLElement, color: string, fallback: string, secondary?: string | null): void {
  for (const [name, value] of Object.entries(brandCssVariables(color, fallback, secondary))) {
    root.style.setProperty(name, value);
  }
}
