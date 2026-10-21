/**
 * How a compared polarization series is drawn (#129): its colour and line style both come from
 * its slot, which the series keeps while it exists (removing another series never restyles it).
 *
 *  - slots 0–3: solid lines, the theme's four comparison colours (ChartTheme.series);
 *  - slots 4–7: dashed lines, the same four colours;
 *  - slots 8–9: dotted lines, the first two colours.
 *
 * No new hues: the four colours are the ones validated for colour-blind separation and contrast.
 * The dashed and dotted lines also carry a few sparse markers (triangle / diamond): a dotted 2 px
 * line has a third of a solid line's ink, and lines that share a colour (slots 0 / 4 / 8) are
 * told apart only by their dash, which is lost where they run steep or on top of each other; a
 * marker shape survives both and does not depend on colour vision.
 *
 * The same dash geometry draws the chart's lines (ECharts), its legend icons, and the line
 * samples of the chips, tooltip rows, table headers and round values (SVG), so they always
 * match. The samples and legend icons show the colour and dash only: a marker in the middle of
 * an 18 px sample would cover the dash that tells the line apart (two dashes become one); the
 * markers are a cue on the chart, on the lines themselves.
 */

export type LineDash = "solid" | "dashed" | "dotted";
export type MarkerShape = "triangle" | "diamond";

/** Colours of the comparison palette (ChartTheme.series). */
export const SERIES_COLORS = 4;
const DASHES: readonly LineDash[] = ["solid", "dashed", "dotted"];

export interface SlotStyle {
  /** Index into the comparison palette. */
  colorIndex: number;
  dash: LineDash;
}

/** The colour and line style of a slot (an invalid slot draws like slot 0). */
export function slotStyle(slot: number): SlotStyle {
  const safe = Number.isInteger(slot) && slot >= 0 ? slot : 0;
  const group = Math.min(Math.floor(safe / SERIES_COLORS), DASHES.length - 1);
  return { colorIndex: safe % SERIES_COLORS, dash: DASHES[group] as LineDash };
}

/** Width of every polarization line (px). */
export const LINE_WIDTH = 2;

export interface DashGeometry {
  /** Dash pattern for a LINE_WIDTH line (null = solid). */
  pattern: readonly number[] | null;
  cap: "butt" | "round";
  /** Sparse markers on the line (null = none). */
  marker: MarkerShape | null;
}

/**
 * Dashes of 6 px with 3 px gaps; dots as round caps on near-zero dashes (2.5 px dots, 2 px gaps),
 * which stay dots at any zoom rather than turning into a lighter solid line.
 */
const GEOMETRY: Readonly<Record<LineDash, DashGeometry>> = {
  solid: { pattern: null, cap: "butt", marker: null },
  dashed: { pattern: [6, 3], cap: "butt", marker: "triangle" },
  dotted: { pattern: [0.5, 4], cap: "round", marker: "diamond" },
};

export function dashGeometry(dash: LineDash): DashGeometry {
  return GEOMETRY[dash];
}

/** ECharts `lineStyle` of a series in `color` with `dash`. */
export function echartsLineStyle(color: string, dash: LineDash) {
  const { pattern, cap } = GEOMETRY[dash];
  return {
    color,
    width: LINE_WIDTH,
    type: pattern === null ? ("solid" as const) : [...pattern],
    cap,
  };
}

// ─── Sparse markers ─────────────────────────────────────────────────────────────────────────────

/** Size (px) of the chart's markers. */
export const MARKER_SIZE = 6;
/** A marked line carries between this many and twice as many markers. */
export const MARKERS_PER_LINE = 6;

/** The slots that carry markers: 4–9 (dashed and dotted). */
const MARKED_SLOTS = 6;

/**
 * Where a slot's markers start within their spacing, in (0, 1): the six marked slots get six
 * distinct offsets, so the markers of different lines never line up in columns.
 */
export function markerPhase(slot: number): number {
  const index = Math.min(Math.max(0, slot - SERIES_COLORS), MARKED_SLOTS - 1);
  return (index + 0.5) / MARKED_SLOTS;
}

/**
 * A few of a line's points to draw markers on: every `step`-th point, `step` a power of two that
 * leaves MARKERS_PER_LINE to twice as many markers. While a live run grows, the markers already
 * drawn stay where they are (until the count doubles and every other one goes). Gaps get none.
 */
export function markerPoints(
  points: ReadonlyArray<readonly [number, number | null]>,
  phase: number,
): Array<[number, number]> {
  const count = points.length;
  let step = 1;
  while (count / step > MARKERS_PER_LINE * 2) step *= 2;
  const offset = Math.min(step - 1, Math.floor(step * Math.max(0, phase)));
  const out: Array<[number, number]> = [];
  for (let index = offset; index < count; index += step) {
    const point = points[index] as readonly [number, number | null];
    if (point[1] !== null) out.push([point[0], point[1]]);
  }
  return out;
}

// ─── Line samples (SVG) ─────────────────────────────────────────────────────────────────────────

/** A line sample: a short line in the series' colour and dash (two dashes, four dots). */
export interface SampleShape {
  width: number;
  height: number;
  line: { x1: number; y1: number; x2: number; y2: number };
  strokeWidth: number;
  /** stroke-dasharray (null = solid). */
  dasharray: string | null;
  cap: "butt" | "round";
}

export const SAMPLE_WIDTH = 18;
export const SAMPLE_HEIGHT = 8;

export function sampleShape(dash: LineDash): SampleShape {
  const { pattern, cap } = GEOMETRY[dash];
  const cy = SAMPLE_HEIGHT / 2;
  return {
    width: SAMPLE_WIDTH,
    height: SAMPLE_HEIGHT,
    line: { x1: 1, y1: cy, x2: SAMPLE_WIDTH - 1, y2: cy },
    strokeWidth: LINE_WIDTH,
    dasharray: pattern === null ? null : pattern.join(" "),
    cap,
  };
}
