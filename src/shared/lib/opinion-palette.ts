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
