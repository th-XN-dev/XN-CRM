/**
 * Brand color math. An organization picks one hex color; the UI derives a
 * full 50–950 palette in OKLCH (perceptually even steps, hue preserved) and a
 * readable foreground for it. No component ever hardcodes a color.
 */

export const PALETTE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type PaletteStep = (typeof PALETTE_STEPS)[number];
export type Palette = Record<PaletteStep, string>;

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Target lightness and chroma share per step (tuned to look like Tailwind scales). */
const STEP_LIGHTNESS: Record<PaletteStep, number> = {
  50: 0.975,
  100: 0.945,
  200: 0.89,
  300: 0.815,
  400: 0.72,
  500: 0.63,
  600: 0.545,
  700: 0.47,
  800: 0.405,
  900: 0.35,
  950: 0.27,
};
const STEP_CHROMA: Record<PaletteStep, number> = {
  50: 0.1,
  100: 0.22,
  200: 0.42,
  300: 0.68,
  400: 0.9,
  500: 1,
  600: 1,
  700: 0.9,
  800: 0.78,
  900: 0.66,
  950: 0.55,
};

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function normalizeHex(value: string): string {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) throw new Error(`Invalid hex color: ${value}`);
  return `#${match[1].toUpperCase()}`;
}

export function buildPalette(hex: string): Palette {
  const { c, h } = hexToOklch(hex);
  const palette = {} as Palette;
  for (const step of PALETTE_STEPS) {
    palette[step] = oklchToHex({ l: STEP_LIGHTNESS[step], c: c * STEP_CHROMA[step], h });
  }
  return palette;
}

/** WCAG 2.x contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (la + 0.05) / (lb + 0.05);
}

/** Black or white — whichever reads better on `background`. */
export function readableOn(background: string): '#FFFFFF' | '#0B0B0F' {
  return contrastRatio(background, '#FFFFFF') >= contrastRatio(background, '#0B0B0F')
    ? '#FFFFFF'
    : '#0B0B0F';
}

export function lightnessOf(hex: string): number {
  return hexToOklch(hex).l;
}

// ─── conversions (sRGB ↔ OKLab ↔ OKLCH) ─────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function oklchToLinearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Reduces chroma until the color fits sRGB (keeps lightness and hue). */
function oklchToHex(color: Oklch): string {
  let { c } = color;
  let rgb = oklchToLinearRgb({ ...color, c });
  for (let i = 0; i < 30 && !inGamut(rgb); i++) {
    c *= 0.9;
    rgb = oklchToLinearRgb({ ...color, c });
  }
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}
