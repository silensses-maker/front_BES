/**
 * Bipolar red / slate / blue palette for opinion-related visualizations.
 *
 * - Red  (#ef4444) → low belief values (approaching 0, opposing pole)
 * - Slate (#94a3b8) → neutral midpoint (belief ≈ 0.5)
 * - Blue (#3b82f6) → high belief values (approaching 1, supporting pole)
 *
 * Consumed by:
 *  - `simulation-canvas` (issue #47) — Cosmograph `pointColorPalette` with `continuous` strategy,
 *    and the per-round colour buffers of the direct repaint (#142, through the numeric
 *    {@link opinionRgb} / {@link divergenceRgb})
 *  - charts (issue #49) — axis / legend color scale
 *  - agent inspector (issue #51) — per-agent belief badge
 *  - static topology toggle (issue #99) — initial / final view coloring
 *
 * Lives in `shared/lib` because it is cross-feature and carries no React or
 * component-level concerns.
 */
export const OPINION_PALETTE = ["#ef4444", "#94a3b8", "#3b82f6"] as const;

/** An `[r, g, b]` colour, 0-255 per channel. */
export type Rgb = readonly [number, number, number];

/** Parses a `#rrggbb` string into an `[r, g, b]` tuple (0-255). */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linear interpolation per channel, rounded to integers (what the CSS strings carry). */
function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function cssRgb(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// ─── Continuous interpolation ───────────────────────────────────────────────

const PALETTE_RGB = [
  hexToRgb(OPINION_PALETTE[0]),
  hexToRgb(OPINION_PALETTE[1]),
  hexToRgb(OPINION_PALETTE[2]),
] as const;

/**
 * Numeric form of {@link interpolateOpinion}: the same `[r, g, b]` (0-255, rounded) the CSS
 * string carries. Values outside `[0, 1]` are clamped; NaN gives NaN channels (the CSS string is
 * then `rgb(NaN, NaN, NaN)`, which colour parsers reject).
 */
export function opinionRgb(value: number): Rgb {
  const v = Math.min(1, Math.max(0, value));
  // Two segments: [0, 0.5] → stops 0→1, [0.5, 1] → stops 1→2.
  if (v < 0.5) return lerpRgb(PALETTE_RGB[0], PALETTE_RGB[1], v / 0.5);
  return lerpRgb(PALETTE_RGB[1], PALETTE_RGB[2], (v - 0.5) / 0.5);
}

/**
 * Maps a belief value in `[0, 1]` to a CSS `rgb(...)` string by linearly
 * interpolating across the 3-stop {@link OPINION_PALETTE} at positions
 * `[0, 0.5, 1]`. Replicates what Cosmograph's `continuous` color strategy does
 * internally, so the Final-view `pointColorByFn` matches the Initial view, and
 * charts (#49) / inspector (#51) share one belief→color mapping.
 *
 * Values outside `[0, 1]` are clamped.
 */
export function interpolateOpinion(value: number): string {
  return cssRgb(opinionRgb(value));
}

// ─── Public-private divergence scale ────────────────────────────────────────

/** Slate (no divergence) → violet (≥ 0.2). Mockup's "Divergencia púb-priv". */
export const DIVERGENCE_PALETTE = ["#94a3b8", "#a855f7"] as const;

/** The divergence scale's position is `t = divergence · DIVERGENCE_GAIN`: it saturates at 0.2. */
export const DIVERGENCE_GAIN = 5;

const DIVERGENCE_RGB = [hexToRgb(DIVERGENCE_PALETTE[0]), hexToRgb(DIVERGENCE_PALETTE[1])] as const;

/** Numeric form of {@link interpolateDivergence} (0-255, rounded). */
export function divergenceRgb(divergence: number): Rgb {
  const t = Math.max(0, Math.min(1, divergence * DIVERGENCE_GAIN));
  return lerpRgb(DIVERGENCE_RGB[0], DIVERGENCE_RGB[1], t);
}

/**
 * Maps |public − private| to the divergence scale. The mockup saturates at
 * 0.2 (t = d·5): small gaps are already visually meaningful.
 */
export function interpolateDivergence(divergence: number): string {
  return cssRgb(divergenceRgb(divergence));
}
