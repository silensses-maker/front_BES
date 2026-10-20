import { describe, expect, it } from "vitest";
import { PolarizationError } from "./errors";
import { isClose, npMax, npMin, npSign, npSum, pyMin } from "./np";
import { mecBisectionValue, minimizeScalarBounded } from "./optimization";
import { BiPol } from "./proposed/bipol";
import { GeneralizedMEC } from "./proposed/generalized-mec";
import { minmaxNormalizeX, validateHistogram, validateParameters } from "./validation";

/** Reference pairwise summation written independently (numpy's algorithm, recursive form). */
function referencePairwise(a: number[]): number {
  const go = (start: number, n: number): number => {
    if (n < 8) {
      let s = 0;
      for (let i = 0; i < n; i++) s += a[start + i] as number;
      return s;
    }
    if (n <= 128) {
      const r = a.slice(start, start + 8);
      let i = 8;
      for (; i < n - (n % 8); i += 8)
        for (let j = 0; j < 8; j++) r[j] = (r[j] as number) + (a[start + i + j] as number);
      let s = r[0]! + r[1]! + (r[2]! + r[3]!) + (r[4]! + r[5]! + (r[6]! + r[7]!));
      for (; i < n; i++) s += a[start + i] as number;
      return s;
    }
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return go(start, n2) + go(start + n2, n - n2);
  };
  return go(0, a.length);
}

describe("numpy helpers", () => {
  it("npSum reproduces numpy's pairwise summation order", () => {
    for (const n of [0, 1, 7, 8, 9, 100, 128, 129, 300, 1000]) {
      const values = Array.from({ length: n }, (_, i) => 0.1 * ((i * 7919) % 13) + 1e-9 * i);
      expect(npSum(values)).toBe(referencePairwise(values));
    }
    // Different from a left-to-right loop for some inputs: proves the order is not naive
    const values = [1, ...new Array<number>(15).fill(1e-16)];
    let naive = 0;
    for (const v of values) naive += v;
    expect(npSum(values)).not.toBe(naive);
  });

  it("npSign, pyMin, npMax, npMin and isClose follow numpy / Python", () => {
    expect([npSign(3), npSign(-2), npSign(0)]).toEqual([1, -1, 0]);
    expect(npSign(Number.NaN)).toBeNaN();
    expect(pyMin(1, 2)).toBe(1);
    expect(pyMin(2, 1)).toBe(1);
    expect(pyMin(0.5, Number.NaN)).toBe(0.5);
    expect(npMax([1, 3, 2])).toBe(3);
    expect(npMin([1, 3, -2])).toBe(-2);
    expect(npMax([1, Number.NaN])).toBeNaN();
    expect(npMin([1, Number.NaN])).toBeNaN();
    expect(isClose(1, 1 + 1e-10, 1e-9)).toBe(true);
    expect(isClose(1, 1.1, 1e-9)).toBe(false);
    expect(isClose(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 1e-9)).toBe(true);
    expect(isClose(Number.POSITIVE_INFINITY, 1, 1e-9)).toBe(false);
  });
});

describe("validation", () => {
  it("min–max normalizes positions (all-equal → zeros)", () => {
    expect(Array.from(minmaxNormalizeX(Float64Array.from([1, 3, 5, 7, 9])))).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    expect(Array.from(minmaxNormalizeX(Float64Array.from([5, 5, 5])))).toEqual([0, 0, 0]);
  });

  it("normalizes weights only when asked", () => {
    expect(Array.from(validateHistogram([0, 0.5, 1], [2, 3, 5]).weights)).toEqual([2, 3, 5]);
    expect(
      Array.from(validateHistogram([0, 0.5, 1], [2, 3, 5], { normalizeWeights: true }).weights),
    ).toEqual([0.2, 0.3, 0.5]);
    expect(
      Array.from(validateHistogram([1, 2, 3], [1, 1, 1], { normalizePositions: false }).x),
    ).toEqual([1, 2, 3]);
  });

  it("validates parameters: numeric (TypeError) and positive (ValueError)", () => {
    expect(() => validateParameters({ alpha: 1, beta: 2 })).not.toThrow();
    const typeError = (() => {
      try {
        validateParameters({ alpha: "x" });
      } catch (err) {
        return err as PolarizationError;
      }
      return null;
    })();
    expect(typeError?.pythonType).toBe("TypeError");
    expect(typeError?.message).toBe("Parameter alpha must be numeric");
    expect(() => validateParameters({ beta: -1 })).toThrow("Parameter beta must be positive");
  });
});

describe("minimizeScalarBounded (SciPy bounded Brent)", () => {
  it("finds the minimum of a smooth function within xatol", () => {
    const result = minimizeScalarBounded((x) => (x - 0.3) ** 2 + 1, [0, 1]);
    expect(result.success).toBe(true);
    expect(result.status).toBe(0);
    expect(result.x).toBeCloseTo(0.3, 4);
    expect(result.fun).toBeCloseTo(1, 9);
    expect(result.nfev).toBeGreaterThan(3);
  });

  it("handles minima at the bounds and kinks (parabolic and golden steps)", () => {
    expect(minimizeScalarBounded((x) => x, [0, 1]).x).toBeLessThan(1e-4);
    expect(minimizeScalarBounded((x) => -x, [0, 1]).x).toBeGreaterThan(1 - 1e-4);
    expect(minimizeScalarBounded((x) => Math.abs(x - 0.7), [0, 1]).x).toBeCloseTo(0.7, 4);
  });

  it("reports max function calls and NaN like SciPy", () => {
    expect(minimizeScalarBounded((x) => (x - 0.3) ** 2, [0, 1], { maxiter: 3 }).status).toBe(1);
    expect(minimizeScalarBounded(() => Number.NaN, [0, 1]).status).toBe(2);
  });

  it("rejects invalid bounds", () => {
    expect(() => minimizeScalarBounded((x) => x, [0, Number.POSITIVE_INFINITY])).toThrow(
      "Optimization bounds must be finite scalars.",
    );
    expect(() => minimizeScalarBounded((x) => x, [1, 0])).toThrow(
      "The lower bound exceeds the upper bound.",
    );
  });
});

describe("mecBisectionValue", () => {
  const x = [0, 0.25, 0.5, 0.75, 1];
  const w = [0.4, 0.1, 0, 0.1, 0.4];

  it("matches the bounded optimizer closely for beta > 1", () => {
    const viaBisection = mecBisectionValue(x, w, { alpha: 2, beta: 2 });
    const viaBrent = minimizeScalarBounded(
      (y) => w.reduce((s, wi, i) => s + wi ** 2 * Math.abs((x[i] as number) - y) ** 2, 0),
      [0, 1],
    ).fun;
    expect(viaBisection).toBeCloseTo(viaBrent, 9);
  });

  it("evaluates at the midpoint when the support is narrower than epsilon", () => {
    expect(mecBisectionValue([0, 1e-9], [0.5, 0.5], { alpha: 1, beta: 2 })).toBeCloseTo(
      2 * 0.5 * 0.5e-9 ** 2,
      25,
    );
  });

  it("validates its inputs with the package's messages", () => {
    const cases: Array<[() => unknown, string]> = [
      [() => mecBisectionValue(x, w, { alpha: 0, beta: 2 }), "alpha must be positive"],
      [() => mecBisectionValue(x, w, { alpha: 1, beta: 1 }), "bisection MEC requires beta > 1"],
      [
        () => mecBisectionValue(x, w, { alpha: 1, beta: 2, epsilon: 0 }),
        "epsilon must be positive",
      ],
      [
        () => mecBisectionValue([0, 1], [1], { alpha: 1, beta: 2 }),
        "x and weights must have the same shape",
      ],
      [
        () => mecBisectionValue([0], [1], { alpha: 1, beta: 2 }),
        "At least two points are required",
      ],
      [
        () => mecBisectionValue([1, 0], [1, 1], { alpha: 1, beta: 2 }),
        "x values must be strictly increasing",
      ],
      [
        () => mecBisectionValue([0, 1], [1, -1], { alpha: 1, beta: 2 }),
        "All weights must be non-negative",
      ],
      [
        () => mecBisectionValue([0, 1], [0, 0], { alpha: 1, beta: 2 }),
        "At least one weight must be positive",
      ],
      [
        () => mecBisectionValue([0, Number.POSITIVE_INFINITY], [1, 1], { alpha: 1, beta: 2 }),
        "x and weights must be finite",
      ],
    ];
    for (const [run, message] of cases) expect(run).toThrow(message);
  });
});

describe("measure edge semantics", () => {
  it("BiPol returns 0 when all the mass sits at the mean", () => {
    expect(new BiPol().compute(Float64Array.from([0, 1]), Float64Array.from([1, 0]))).toBe(0);
  });

  it("GeneralizedMEC rejects non-finite alienation values", () => {
    const measure = new GeneralizedMEC(1, () => Number.POSITIVE_INFINITY);
    expect(() => measure.call([0, 1], [0.5, 0.5])).toThrow(
      "Alienation function must return finite values.",
    );
  });
});
