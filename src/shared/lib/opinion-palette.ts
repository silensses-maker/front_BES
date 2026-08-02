/**
 * Bipolar red / slate / blue palette for opinion-related visualizations.
 *
 * - Red  (#ef4444) → low belief values (approaching 0, opposing pole)
 * - Slate (#94a3b8) → neutral midpoint (belief ≈ 0.5)
 * - Blue (#3b82f6) → high belief values (approaching 1, supporting pole)
 *
 * Consumed by:
 *  - `simulation-canvas` (issue #47) — Cosmograph `pointColorPalette` with `continuous` strategy
 *  - charts (issue #49) — axis / legend color scale
 *  - agent inspector (issue #51) — per-agent belief badge
 *  - static topology toggle (issue #99) — initial / final view coloring
 *
 * Lives in `shared/lib` because it is cross-feature and carries no React or
 * component-level concerns.
 */
export const OPINION_PALETTE = ["#ef4444", "#94a3b8", "#3b82f6"] as const;

// ─── Continuous interpolation ───────────────────────────────────────────────

/** Parses a `#rrggbb` string into an `[r, g, b]` tuple (0-255). */
function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const PALETTE_RGB = [
  hexToRgb(OPINION_PALETTE[0]),
  hexToRgb(OPINION_PALETTE[1]),
  hexToRgb(OPINION_PALETTE[2]),
] as const;

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
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  // Two segments: [0, 0.5] → stops 0→1, [0.5, 1] → stops 1→2. Literal indices
  // keep the tuple access non-undefined under noUncheckedIndexedAccess.
  const [from, to] = v < 0.5 ? [PALETTE_RGB[0], PALETTE_RGB[1]] : [PALETTE_RGB[1], PALETTE_RGB[2]];
  const t = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── Public–private divergence scale ────────────────────────────────────────

/** Slate (no divergence) → violet (≥ 0.2). Mockup's "Divergencia púb–priv". */
export const DIVERGENCE_PALETTE = ["#94a3b8", "#a855f7"] as const;

const DIVERGENCE_RGB = [hexToRgb(DIVERGENCE_PALETTE[0]), hexToRgb(DIVERGENCE_PALETTE[1])] as const;

/**
 * Maps |public − private| to the divergence scale. The mockup saturates at
 * 0.2 (t = d·5): small gaps are already visually meaningful.
 */
export function interpolateDivergence(divergence: number): string {
  const t = Math.max(0, Math.min(1, divergence * 5));
  const [from, to] = DIVERGENCE_RGB;
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
