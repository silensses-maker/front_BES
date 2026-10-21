import { describe, expect, it } from "vitest";
import {
  accumulateFineHistogram,
  CATEGORY_COUNTS,
  categoryIndex,
  DEFAULT_CATEGORY_COUNT,
  FINE_BINS,
  fineBinIndex,
  isCategoryCount,
  rebinCounts,
} from "./binning";

/** Deterministic float32 beliefs in [0, 1] (LCG), as the frames deliver them. */
function float32Beliefs(count: number, seed = 7): Float32Array {
  const out = new Float32Array(count);
  let state = seed;
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = state / 2 ** 32;
  }
  return out;
}

/** Every category boundary j/k as float32, plus its float32 neighbours. */
function boundaryBeliefs(): Float32Array {
  const values: number[] = [0, 1];
  for (const k of [...CATEGORY_COUNTS, FINE_BINS]) {
    for (let j = 1; j < k; j++) {
      const b = Math.fround(j / k);
      const bits = new Float32Array([b]);
      const asInt = new Int32Array(bits.buffer);
      const below = new Int32Array([(asInt[0] as number) - 1]);
      const above = new Int32Array([(asInt[0] as number) + 1]);
      values.push(
        b,
        new Float32Array(below.buffer)[0] as number,
        new Float32Array(above.buffer)[0] as number,
      );
    }
  }
  return Float32Array.from(values);
}

describe("fineBinIndex / categoryIndex", () => {
  it("bins with min(last, floor(b·bins)) and clamps out-of-range values", () => {
    expect(fineBinIndex(0)).toBe(0);
    expect(fineBinIndex(0.5)).toBe(105);
    expect(fineBinIndex(1)).toBe(FINE_BINS - 1);
    expect(fineBinIndex(1.5)).toBe(FINE_BINS - 1);
    expect(fineBinIndex(-0.2)).toBe(0);
    expect(fineBinIndex(Number.NaN)).toBe(0);
    expect(categoryIndex(0.2, 5)).toBe(1);
    expect(categoryIndex(0.19999, 5)).toBe(0);
    expect(categoryIndex(1, 5)).toBe(4);
    expect(categoryIndex(-1, 5)).toBe(0);
    expect(categoryIndex(Number.NaN, 3)).toBe(0);
  });

  it("every supported k is an exact sum of fine bins, boundaries included", () => {
    const beliefs = Float32Array.from([...float32Beliefs(5000), ...boundaryBeliefs()]);
    for (const k of CATEGORY_COUNTS) {
      const width = FINE_BINS / k;
      for (const b of beliefs) {
        expect([b, k, Math.floor(fineBinIndex(b) / width)]).toEqual([b, k, categoryIndex(b, k)]);
      }
    }
  });
});

describe("accumulateFineHistogram + rebinCounts", () => {
  it("rebinning the fine histogram equals binning the beliefs directly", () => {
    const beliefs = Float32Array.from([
      ...float32Beliefs(3000, 11),
      ...boundaryBeliefs(),
      1.2,
      -0.1,
    ]);
    const fine = new Uint32Array(FINE_BINS);
    accumulateFineHistogram(beliefs, fine);
    expect(fine.reduce((a, b) => a + b, 0)).toBe(beliefs.length);
    for (const k of CATEGORY_COUNTS) {
      const direct = new Float64Array(k);
      for (const b of beliefs)
        direct[categoryIndex(b, k)] = (direct[categoryIndex(b, k)] as number) + 1;
      expect(Array.from(rebinCounts(fine, k))).toEqual(Array.from(direct));
    }
  });

  it("rejects a k that does not divide 210", () => {
    expect(() => rebinCounts(new Uint32Array(FINE_BINS), 4)).toThrow(RangeError);
  });

  it("writes into a caller-provided buffer", () => {
    const fine = new Uint32Array(FINE_BINS);
    fine[0] = 3;
    fine[209] = 1;
    const out = new Float64Array(3);
    expect(rebinCounts(fine, 3, out)).toBe(out);
    expect(Array.from(out)).toEqual([3, 0, 1]);
  });
});

describe("category counts", () => {
  it("knows the supported category counts", () => {
    expect(DEFAULT_CATEGORY_COUNT).toBe(5);
    expect(CATEGORY_COUNTS).toEqual([3, 5, 7, 10]);
    expect(isCategoryCount(7)).toBe(true);
    expect(isCategoryCount(4)).toBe(false);
    expect(isCategoryCount("5")).toBe(false);
  });
});
