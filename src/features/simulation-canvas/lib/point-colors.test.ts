import { describe, expect, it } from "vitest";
import {
  DIVERGENCE_PALETTE,
  divergenceRgb,
  hexToRgb,
  interpolateDivergence,
  interpolateOpinion,
  OPINION_PALETTE,
  opinionRgb,
} from "@/shared/lib/opinion-palette";
import {
  buildColorBuffer,
  buildPaletteLut,
  buildPointTables,
  buildSizeBuffer,
  DIVERGENCE_LUT,
  type FrameBeliefs,
  lutIndex,
  OPINION_LUT,
  PALETTE_LUT_STEPS,
  SILENT_POINT_SIZE,
  SPEAKING_POINT_SIZE,
  STRATEGY_COLORS,
  strategyColor,
  UNKNOWN_POINT_COLOR,
} from "./point-colors";

/** The RGBA (0–1) a CSS `rgb(r, g, b)` / `#rrggbb` colour becomes in Cosmograph (alpha 1). */
function cssToRgba(css: string): number[] {
  if (css.startsWith("#")) return [...hexToRgb(css).map((c) => c / 255), 1];
  const inner = css.slice(css.indexOf("(") + 1, css.indexOf(")"));
  return [...inner.split(",").map((part) => Number(part.trim()) / 255), 1];
}

function colorAt(buffer: Float32Array, point: number): number[] {
  return Array.from(buffer.subarray(point * 4, point * 4 + 4));
}

/** One 8-bit step, plus Float32 rounding of the 0–1 channel values. */
const ONE_STEP = 1 + 1e-3;

/** Largest per-channel difference, in 0–255 units. */
function maxDiff255(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) * 255));
}

const SAMPLES = [0, 0.001, 0.1, 0.25, 0.333, 0.4999, 0.5, 0.5001, 0.62, 0.75, 0.9, 0.999, 1];

describe("palette LUTs", () => {
  it("match the CSS opinion colours within one step of 255", () => {
    for (const v of SAMPLES) {
      const lut = Array.from(OPINION_LUT.subarray(lutIndex(v) * 4, lutIndex(v) * 4 + 4));
      expect(maxDiff255(lut, cssToRgba(interpolateOpinion(v)))).toBeLessThanOrEqual(ONE_STEP);
    }
  });

  it("match the CSS divergence colours within one step of 255 (indexed by d · 5)", () => {
    for (const d of [0, 0.01, 0.05, 0.1, 0.15, 0.199, 0.2, 0.5, 1]) {
      const k = lutIndex(d * 5);
      const lut = Array.from(DIVERGENCE_LUT.subarray(k * 4, k * 4 + 4));
      expect(maxDiff255(lut, cssToRgba(interpolateDivergence(d)))).toBeLessThanOrEqual(ONE_STEP);
    }
  });

  it("hit the palette stops exactly", () => {
    expect(colorAt(OPINION_LUT, 0)).toEqual(cssToRgba(OPINION_PALETTE[0]).map(Math.fround));
    expect(colorAt(OPINION_LUT, PALETTE_LUT_STEPS - 1)).toEqual(
      cssToRgba(OPINION_PALETTE[2]).map(Math.fround),
    );
    expect(colorAt(DIVERGENCE_LUT, PALETTE_LUT_STEPS - 1)).toEqual(
      cssToRgba(DIVERGENCE_PALETTE[1]).map(Math.fround),
    );
  });

  it("builds `steps` rows from the colour function", () => {
    const lut = buildPaletteLut(() => [255, 0, 51], 3);
    expect(lut).toHaveLength(12);
    expect(colorAt(lut, 2)).toEqual([1, 0, Math.fround(0.2), 1]);
  });

  it("keeps the numeric palette functions in step with the CSS strings", () => {
    expect(`rgb(${opinionRgb(0.3).join(", ")})`).toBe(interpolateOpinion(0.3));
    expect(`rgb(${divergenceRgb(0.07).join(", ")})`).toBe(interpolateDivergence(0.07));
  });
});

describe("lutIndex", () => {
  it("clamps to the table and rounds to the nearest row", () => {
    expect(lutIndex(-3)).toBe(0);
    expect(lutIndex(0)).toBe(0);
    expect(lutIndex(2)).toBe(PALETTE_LUT_STEPS - 1);
    expect(lutIndex(0.5)).toBe(Math.round(0.5 * (PALETTE_LUT_STEPS - 1)));
    expect(lutIndex(0.5, 3)).toBe(1);
  });

  it("flags NaN", () => {
    expect(lutIndex(Number.NaN)).toBe(-1);
  });
});

describe("strategyColor", () => {
  it("cycles the categorical palette and falls back to the neutral slate", () => {
    expect(strategyColor(0)).toBe(STRATEGY_COLORS[0]);
    expect(strategyColor(6)).toBe(STRATEGY_COLORS[1]);
    expect(strategyColor(-1)).toBe(OPINION_PALETTE[1]);
    expect(strategyColor(1.5)).toBe(OPINION_PALETTE[1]);
  });
});

// Points in a different order than the agent indices (Cosmograph's order = topology order).
const AGENTS = [
  { index: 2, initialBelief: 0.1, silenceStrategy: 0 },
  { index: 0, initialBelief: 0.9, silenceStrategy: 3 },
  { index: 1, initialBelief: 0.5, silenceStrategy: 7 },
  { index: 5, initialBelief: 0.3, silenceStrategy: -1 },
];

const FRAME: FrameBeliefs = {
  publicBelief: new Float32Array([0, 0.25, 1, 0.6, 0.6]),
  privateBelief: new Float32Array([0.04, 0.25, 0.8, 0.6, 0.6]),
  speaking: new Uint8Array([1, 0, 1, 0, 0]),
};

/** The colour the CSS path gave point `p` (product's colorByFn semantics). */
function expectedCss(colorBy: "pub" | "priv" | "div", agent: (typeof AGENTS)[number]): string {
  const pub = FRAME.publicBelief[agent.index] ?? agent.initialBelief;
  const priv = FRAME.privateBelief[agent.index] ?? agent.initialBelief;
  if (colorBy === "pub") return interpolateOpinion(pub);
  if (colorBy === "priv") return interpolateOpinion(priv);
  return interpolateDivergence(Math.abs(pub - priv));
}

describe("buildPointTables", () => {
  it("keeps the topology order and maps each point to its agent", () => {
    const tables = buildPointTables(AGENTS);
    expect(tables.count).toBe(4);
    expect(Array.from(tables.agentIndex)).toEqual([2, 0, 1, 5]);
    expect(Array.from(tables.initialBelief)).toEqual([0.1, 0.9, 0.5, 0.3]);
    expect(colorAt(tables.strategyColors, 1)).toEqual(
      cssToRgba(STRATEGY_COLORS[3]).map(Math.fround),
    );
    // strategy 7 → 7 % 5 = 2; strategy -1 → no colour → slate
    expect(colorAt(tables.strategyColors, 2)).toEqual(
      cssToRgba(STRATEGY_COLORS[2]).map(Math.fround),
    );
    expect(colorAt(tables.strategyColors, 3)).toEqual(
      cssToRgba(OPINION_PALETTE[1]).map(Math.fround),
    );
  });

  it("gives a point without a valid agent index the neutral slate", () => {
    const tables = buildPointTables([
      { index: Number.NaN, initialBelief: 0.2, silenceStrategy: 1 },
    ]);
    expect(colorAt(tables.strategyColors, 0)).toEqual(
      cssToRgba(OPINION_PALETTE[1]).map(Math.fround),
    );
  });
});

describe("buildColorBuffer", () => {
  const tables = buildPointTables(AGENTS);

  it.each([
    "pub",
    "priv",
    "div",
  ] as const)("colours every point by its agent's %s value, in point order", (colorBy) => {
    const out = new Float32Array(16);
    buildColorBuffer(out, tables, colorBy, FRAME);
    AGENTS.forEach((agent, p) => {
      expect(
        maxDiff255(colorAt(out, p), cssToRgba(expectedCss(colorBy, agent))),
      ).toBeLessThanOrEqual(ONE_STEP);
    });
  });

  it("falls back to the initial belief for an agent the frame does not hold", () => {
    const out = new Float32Array(16);
    buildColorBuffer(out, tables, "pub", FRAME);
    // agent 5 is beyond the frame arrays (length 5 → index 5 undefined)
    expect(maxDiff255(colorAt(out, 3), cssToRgba(interpolateOpinion(0.3)))).toBeLessThanOrEqual(
      ONE_STEP,
    );
  });

  it("uses the strategy colours for estr, with or without a frame", () => {
    const out = new Float32Array(16);
    buildColorBuffer(out, tables, "estr", null);
    expect(out).toEqual(tables.strategyColors);
  });

  it("colours by the initial beliefs when there is no frame", () => {
    const out = new Float32Array(16);
    buildColorBuffer(out, tables, "pub", null);
    AGENTS.forEach((agent, p) => {
      expect(
        maxDiff255(colorAt(out, p), cssToRgba(interpolateOpinion(agent.initialBelief))),
      ).toBeLessThanOrEqual(ONE_STEP);
    });
    buildColorBuffer(out, tables, "div", null);
    expect(maxDiff255(colorAt(out, 0), cssToRgba(interpolateDivergence(0)))).toBeLessThanOrEqual(
      ONE_STEP,
    );
  });

  it("gives NaN beliefs Cosmograph's unknown colour and invalid points the slate", () => {
    const nanFrame: FrameBeliefs = {
      publicBelief: new Float32Array([Number.NaN]),
      privateBelief: new Float32Array([0.5]),
      speaking: new Uint8Array([0]),
    };
    const t = buildPointTables([
      { index: 0, initialBelief: 0.5, silenceStrategy: 0 },
      { index: Number.POSITIVE_INFINITY, initialBelief: 0.5, silenceStrategy: 0 },
    ]);
    const out = new Float32Array(8);
    buildColorBuffer(out, t, "pub", nanFrame);
    expect(colorAt(out, 0)).toEqual(UNKNOWN_POINT_COLOR.map(Math.fround));
    expect(colorAt(out, 1)).toEqual(cssToRgba(OPINION_PALETTE[1]).map(Math.fround));
    buildColorBuffer(out, t, "div", nanFrame);
    expect(colorAt(out, 0)).toEqual(UNKNOWN_POINT_COLOR.map(Math.fround));
  });
});

describe("buildSizeBuffer", () => {
  const tables = buildPointTables(AGENTS);

  it("makes the agents that spoke larger, in point order", () => {
    const out = new Float32Array(4);
    buildSizeBuffer(out, tables, FRAME);
    // agents 2, 0, 1, 5 → speaking 1, 1, 0, (out of range)
    expect(Array.from(out)).toEqual([
      SPEAKING_POINT_SIZE,
      SPEAKING_POINT_SIZE,
      SILENT_POINT_SIZE,
      SILENT_POINT_SIZE,
    ]);
  });

  it("is uniform without a frame", () => {
    const out = new Float32Array(4).fill(99);
    buildSizeBuffer(out, tables, null);
    expect(Array.from(out)).toEqual([8, 8, 8, 8]);
  });

  it("keeps invalid points at the silent size", () => {
    const t = buildPointTables([{ index: Number.NaN, initialBelief: 0.5, silenceStrategy: 0 }]);
    const out = new Float32Array(1);
    buildSizeBuffer(out, t, FRAME);
    expect(out[0]).toBe(SILENT_POINT_SIZE);
  });
});
