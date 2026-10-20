/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/proposed/bipol.py — implemented by Carlos Pinzón (package README).
 *
 *   BiPol(M) = 4 · π(L) · π(R) · (μ_R − μ_L),   L = {xᵢ < μ},  R = {xᵢ ≥ μ}
 *
 * μ is the weighted mean, μ_L / μ_R the weighted means of each side. It is 0 when all the mass
 * sits at the mean (consensus) and 1 for the 50/50 split at the extremes. Thresholds exist (no
 * parameters).
 */

import { PolarizationMeasure } from "../base";
import { PolarizationError } from "../errors";
import { npSum } from "../np";

/** `np.average(x, weights=w)` over the indices where `mask` holds. */
function average(x: Float64Array, weights: Float64Array, mask: (i: number) => boolean): number {
  const products: number[] = [];
  const selected: number[] = [];
  for (let i = 0; i < x.length; i++) {
    if (!mask(i)) continue;
    products.push((x[i] as number) * (weights[i] as number));
    selected.push(weights[i] as number);
  }
  const scale = npSum(selected);
  if (scale === 0) {
    throw new PolarizationError("ZeroDivisionError", "Weights sum to zero, can't be normalized");
  }
  return npSum(products) / scale;
}

function massWhere(weights: Float64Array, mask: (i: number) => boolean): number {
  const selected: number[] = [];
  for (let i = 0; i < weights.length; i++) if (mask(i)) selected.push(weights[i] as number);
  return npSum(selected);
}

export class BiPol extends PolarizationMeasure {
  protected readonly className = "BiPol";

  compute(x: Float64Array, weights: Float64Array): number {
    const mu = average(x, weights, () => true);

    let allAtMean = true;
    for (let i = 0; i < x.length; i++) {
      if ((weights[i] as number) > 0 && x[i] !== mu) {
        allAtMean = false;
        break;
      }
    }
    if (allAtMean) return 0;

    const left = (i: number) => (x[i] as number) < mu;
    const right = (i: number) => !left(i);

    const meanDiff = average(x, weights, right) - average(x, weights, left);
    return 4 * massWhere(weights, left) * massWhere(weights, right) * meanDiff;
  }
}
