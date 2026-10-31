/**
 * WCAG 2.x contrast of the theme's `oklch(L C H)` tokens (guarded by theme-contrast.test.ts).
 * OKLCH → OKLab → linear sRGB with Björn Ottosson's matrices, each channel clamped to the sRGB
 * gamut, then WCAG's relative luminance and contrast ratio.
 */

/** Linear-light sRGB channels in [0, 1]. */
export type LinearRgb = readonly [number, number, number];

const OKLCH_PREFIX = "oklch(";

/** Parses `oklch(L C H)` (unitless lightness and chroma, hue in degrees); null otherwise. */
export function parseOklch(value: string): readonly [number, number, number] | null {
  const text = value.trim();
  if (!text.startsWith(OKLCH_PREFIX) || !text.endsWith(")")) return null;
  const parts = text.slice(OKLCH_PREFIX.length, -1).trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  return parts as unknown as readonly [number, number, number];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const cube = (value: number) => value ** 3;

/** OKLCH → linear sRGB, clamped to gamut. */
export function oklchToLinearSrgb(l: number, c: number, h: number): LinearRgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const x = cube(l + 0.3963377774 * a + 0.2158037573 * b);
  const y = cube(l - 0.1055613458 * a - 0.0638541728 * b);
  const z = cube(l - 0.0894841775 * a - 1.291485548 * b);
  return [
    clamp01(4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z),
    clamp01(-1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z),
    clamp01(-0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z),
  ];
}

/** Gamma-encoded sRGB channel (0–255) → linear light. */
export function srgbChannelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** `#rgb` / `#rrggbb` → linear sRGB; null when it is not a hex color. */
export function hexToLinearSrgb(hex: string): LinearRgb | null {
  const digits = hex.trim().replace(/^#/, "");
  const full = digits.length === 3 ? Array.from(digits, (d) => d + d).join("") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channel = (i: number) => srgbChannelToLinear(Number.parseInt(full.slice(i, i + 2), 16));
  return [channel(0), channel(2), channel(4)];
}

/** WCAG relative luminance of a linear sRGB color. */
export function relativeLuminance([r, g, b]: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21) of two linear sRGB colors, in either order. */
export function contrastRatio(first: LinearRgb, second: LinearRgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Contrast ratio of two `oklch(…)` colors; null when either cannot be parsed. */
export function oklchContrast(first: string, second: string): number | null {
  const a = parseOklch(first);
  const b = parseOklch(second);
  if (a === null || b === null) return null;
  return contrastRatio(oklchToLinearSrgb(...a), oklchToLinearSrgb(...b));
}
