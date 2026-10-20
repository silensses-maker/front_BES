/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/validation.py — histogram validation shared by every measure.
 */

import { PolarizationError, valueError } from "./errors";
import { npMax, npMin, npSum } from "./np";

/** Normalize x values to [0, 1]; all-equal x maps to zeros. */
export function minmaxNormalizeX(x: Float64Array): Float64Array {
  const xMin = npMin(x);
  const xMax = npMax(x);
  if (xMin === xMax) return new Float64Array(x.length);
  const out = new Float64Array(x.length);
  const range = xMax - xMin;
  for (let i = 0; i < x.length; i++) out[i] = ((x[i] as number) - xMin) / range;
  return out;
}

export interface HistogramOptions {
  /** Divide weights by their sum first. Default false: callers pass masses that sum to 1. */
  normalizeWeights?: boolean;
  /** Rescale x to [0, 1] with min–max. Default true. */
  normalizePositions?: boolean;
}

/**
 * Validates an opinion histogram `(x, weights)` and applies the optional normalizations, in the
 * package's order: shape, at least two points, strictly increasing x, non-negative weights, at
 * least one positive weight. Returns fresh float64 copies.
 */
export function validateHistogram(
  x: ArrayLike<number>,
  weights: ArrayLike<number>,
  { normalizeWeights = false, normalizePositions = true }: HistogramOptions = {},
): { x: Float64Array; weights: Float64Array } {
  let xs: Float64Array = Float64Array.from(x);
  let ws: Float64Array = Float64Array.from(weights);

  if (xs.length !== ws.length) throw valueError("x and weights must have the same shape");
  if (xs.length < 2) throw valueError("At least two points are required");
  for (let i = 1; i < xs.length; i++) {
    if (!((xs[i] as number) - (xs[i - 1] as number) > 0)) {
      throw valueError("x values must be strictly increasing");
    }
  }
  let anyPositive = false;
  for (const w of ws) {
    if (w < 0) throw valueError("All weights must be non-negative");
    if (w > 0) anyPositive = true;
  }
  if (!anyPositive) throw valueError("At least one weight must be positive");

  if (normalizeWeights) {
    const total = npSum(ws);
    ws = ws.map((w) => w / total);
  }
  if (normalizePositions) xs = minmaxNormalizeX(xs);
  return { x: xs, weights: ws };
}

/** Every parameter must be numeric (TypeError) and strictly positive (ValueError). */
export function validateParameters(parameters: Readonly<Record<string, unknown>>): void {
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value !== "number") {
      throw new PolarizationError("TypeError", `Parameter ${name} must be numeric`);
    }
    if (value <= 0) throw valueError(`Parameter ${name} must be positive`);
  }
}
