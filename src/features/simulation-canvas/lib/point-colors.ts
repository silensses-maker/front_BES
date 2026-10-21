import {
  DIVERGENCE_GAIN,
  divergenceRgb,
  hexToRgb,
  OPINION_PALETTE,
  opinionRgb,
  type Rgb,
} from "@/shared/lib/opinion-palette";

/**
 * Per-round point colours and sizes as GPU-ready buffers (#142).
 *
 * The run view repaints every agent on every round. Instead of handing Cosmograph per-point
 * callbacks that return CSS strings (which it re-queries from DuckDB-WASM and parses on every
 * round), the canvas fills one `Float32Array` of RGBA colours and one of sizes, in Cosmograph's
 * point order, and pushes them straight to cosmos.gl (see `cosmos-direct.ts`).
 *
 * Colours come from precomputed lookup tables (LUTs) of the same palettes the CSS functions use
 * (`opinionRgb` / `divergenceRgb`, `PALETTE_LUT_STEPS` steps each): identical to the CSS colours
 * within the LUT quantization (at most 1 of 255 per channel). cosmos.gl takes straight
 * (non-premultiplied) RGBA in 0–1, the format Cosmograph itself produces from CSS strings.
 */

/** Node colouring modes (mockup "Colorear por"). Round 0 shows the initial state. */
export type ColorBy = "pub" | "priv" | "div" | "estr";

/** Categorical palette for "Colorear por estrategia" (mockup PAL), indexed by strategy id. */
export const STRATEGY_COLORS = ["#4f6bd8", "#7cb342", "#f59e0b", "#ec4899", "#8b5cf6"] as const;

/** Size of an agent that spoke in the viewed round, and of every other agent. */
export const SPEAKING_POINT_SIZE = 14;
export const SILENT_POINT_SIZE = 8;

/** Steps of each continuous palette table. */
export const PALETTE_LUT_STEPS = 256;

/**
 * Colour of a belief that is not a number. The CSS path produced `rgb(NaN, NaN, NaN)`, which
 * Cosmograph replaces with its default `unknownColor`, `rgba(205, 207, 213, 0.9)`.
 */
export const UNKNOWN_POINT_COLOR: readonly [number, number, number, number] = [
  205 / 255,
  207 / 255,
  213 / 255,
  0.9,
];

/** The CSS colour of a strategy: its categorical colour, the neutral slate for unknown ids. */
export function strategyColor(strategy: number): string {
  return STRATEGY_COLORS[strategy % STRATEGY_COLORS.length] ?? OPINION_PALETTE[1];
}

function rgba(rgb: Rgb): [number, number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1];
}

/** A palette sampled at `steps` evenly spaced positions of `[0, 1]`, as RGBA 0–1 quadruples. */
export function buildPaletteLut(
  colorAt: (t: number) => Rgb,
  steps = PALETTE_LUT_STEPS,
): Float32Array {
  const lut = new Float32Array(steps * 4);
  for (let k = 0; k < steps; k++) lut.set(rgba(colorAt(k / (steps - 1))), k * 4);
  return lut;
}

/** Opinion palette by belief in [0, 1]. */
export const OPINION_LUT = buildPaletteLut(opinionRgb);

/** Divergence palette by scale position t = |pub − priv| · DIVERGENCE_GAIN in [0, 1]. */
export const DIVERGENCE_LUT = buildPaletteLut((t) => divergenceRgb(t / DIVERGENCE_GAIN));

const MID_COLOR = rgba(hexToRgb(OPINION_PALETTE[1]));

/** LUT row of a position in [0, 1] (clamped); -1 for NaN. */
export function lutIndex(position: number, steps = PALETTE_LUT_STEPS): number {
  if (Number.isNaN(position)) return -1;
  if (position <= 0) return 0;
  if (position >= 1) return steps - 1;
  return Math.round(position * (steps - 1));
}

/** Writes LUT row `k` (or the unknown colour for -1) at point `i` of `out`. */
function writeLut(out: Float32Array, i: number, lut: Float32Array, k: number): void {
  const o = i * 4;
  if (k < 0) {
    out.set(UNKNOWN_POINT_COLOR, o);
    return;
  }
  const s = k * 4;
  out[o] = lut[s] as number;
  out[o + 1] = lut[s + 1] as number;
  out[o + 2] = lut[s + 2] as number;
  out[o + 3] = lut[s + 3] as number;
}

/** The per-round inputs of the buffers: the viewed frame's typed arrays, indexed by agent. */
export interface FrameBeliefs {
  publicBelief: ArrayLike<number>;
  privateBelief: ArrayLike<number>;
  speaking: ArrayLike<number>;
}

/**
 * Static per-point data of a network, in Cosmograph's point order (= `topology.agents` order,
 * the row order handed to `prepareCosmographData`).
 */
export interface PointTables {
  /** Number of points. */
  count: number;
  /** Agent index of each point: the key into the frame arrays. */
  agentIndex: Float64Array;
  /** Initial belief of each point: the fallback when the frame has no value for the agent. */
  initialBelief: Float64Array;
  /** Strategy colour of each point (RGBA 0–1), fixed for the network. */
  strategyColors: Float32Array;
}

/** The fields of a topology agent the tables use. */
export interface PointAgent {
  index: number;
  initialBelief: number;
  silenceStrategy: number;
}

export function buildPointTables(agents: readonly PointAgent[]): PointTables {
  const count = agents.length;
  const agentIndex = new Float64Array(count);
  const initialBelief = new Float64Array(count);
  const strategyColors = new Float32Array(count * 4);
  const strategyRgba = STRATEGY_COLORS.map((hex) => rgba(hexToRgb(hex)));
  for (let i = 0; i < count; i++) {
    const agent = agents[i] as PointAgent;
    agentIndex[i] = agent.index;
    initialBelief[i] = agent.initialBelief;
    const color = Number.isFinite(agent.index)
      ? (strategyRgba[agent.silenceStrategy % STRATEGY_COLORS.length] ?? MID_COLOR)
      : MID_COLOR;
    strategyColors.set(color, i * 4);
  }
  return { count, agentIndex, initialBelief, strategyColors };
}

/** `frame[agent]`, or the fallback when the frame holds no value for it (out of range). */
function beliefOf(values: ArrayLike<number>, agent: number, fallback: number): number {
  const value = values[agent];
  return value === undefined ? fallback : value;
}

/**
 * Fills `out` (length `4 · tables.count`) with the colours of the viewed round, in point order:
 * - `estr`: the strategy colours (no frame needed);
 * - `pub` / `priv`: the opinion palette at the agent's public / private belief;
 * - `div`: the divergence palette at |public − private|.
 * A point whose agent index is not a finite number gets the neutral slate, a NaN belief the
 * unknown colour, an agent missing from the frame its initial belief — the fallbacks of the CSS
 * path. With no frame (`frame === null`) both beliefs are the initial belief.
 */
export function buildColorBuffer(
  out: Float32Array,
  tables: PointTables,
  colorBy: ColorBy,
  frame: FrameBeliefs | null,
): void {
  if (colorBy === "estr") {
    out.set(tables.strategyColors);
    return;
  }
  const { count, agentIndex, initialBelief } = tables;
  for (let i = 0; i < count; i++) {
    const agent = agentIndex[i] as number;
    if (!Number.isFinite(agent)) {
      out.set(MID_COLOR, i * 4);
      continue;
    }
    const fallback = initialBelief[i] as number;
    const pub = frame === null ? fallback : beliefOf(frame.publicBelief, agent, fallback);
    const priv = frame === null ? fallback : beliefOf(frame.privateBelief, agent, fallback);
    if (colorBy === "div") {
      writeLut(out, i, DIVERGENCE_LUT, lutIndex(Math.abs(pub - priv) * DIVERGENCE_GAIN));
    } else {
      writeLut(out, i, OPINION_LUT, lutIndex(colorBy === "pub" ? pub : priv));
    }
  }
}

/** Fills `out` (length `tables.count`) with the point sizes: speaking agents larger. */
export function buildSizeBuffer(
  out: Float32Array,
  tables: PointTables,
  frame: FrameBeliefs | null,
): void {
  if (frame === null) {
    out.fill(SILENT_POINT_SIZE);
    return;
  }
  const { count, agentIndex } = tables;
  for (let i = 0; i < count; i++) {
    const agent = agentIndex[i] as number;
    out[i] =
      Number.isFinite(agent) && frame.speaking[agent] ? SPEAKING_POINT_SIZE : SILENT_POINT_SIZE;
  }
}
