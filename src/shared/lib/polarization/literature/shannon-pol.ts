/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/shannon.py
 * Reference: [4] Tastle & Wierman, "Consensus and dissention: A measure of ordinal dispersion",
 * International Journal of Approximate Reasoning 45(3) (2007) — the dissention measure.
 *
 *   Shannon_pol(M) = −Σᵢ πᵢ log₂(1 − |xᵢ − μ| / (x_max − x_min) + ε),   μ = Σᵢ πᵢ xᵢ
 *
 * ε is numpy's float64 machine epsilon, which keeps the logarithm finite at the extremes.
 */

import { PolarizationMeasure } from "../base";
import { npMax, npMin, npSum } from "../np";

/** `np.finfo(float).eps`. */
const EPS = Number.EPSILON;

export class ShannonPol extends PolarizationMeasure {
  protected readonly className = "ShannonPol";

  compute(x: Float64Array, weights: Float64Array): number {
    const n = weights.length;
    const products = new Float64Array(n);
    for (let i = 0; i < n; i++) products[i] = (weights[i] as number) * (x[i] as number);
    const muX = npSum(products);
    const dx = npMax(x) - npMin(x);

    for (let i = 0; i < n; i++) {
      products[i] =
        (weights[i] as number) * Math.log2(1 - Math.abs((x[i] as number) - muX) / dx + EPS);
    }
    return -npSum(products);
  }
}
