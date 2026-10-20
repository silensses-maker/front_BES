/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/esteban_ray.py
 * Reference: [3] Kawada, Nakamura & Sunada, "A characterization of the Esteban–Ray polarization
 * measures", Economics Letters 169 (2018), doi:10.1016/j.econlet.2018.05.011; Esteban & Ray,
 * "On the measurement of polarization", Econometrica (1994).
 *
 *   ER_α(M) = K Σᵢ Σⱼ πᵢ^(1+α) πⱼ |xᵢ − xⱼ|,   K = 1 / (2 · 0.5^(2+α)) by default
 *
 * α must be in (0, 1.6]. Thresholds exist for α = 0.8 (K is not compared).
 */

import { ParametricPolarizationMeasure } from "../base";
import { valueError } from "../errors";
import { npSum } from "../np";

export class EstebanRay extends ParametricPolarizationMeasure {
  protected readonly className = "EstebanRay";

  constructor(alpha = 0.8, K: number | null = null) {
    if (!(0 < alpha && alpha <= 1.6)) throw valueError("alpha must be in (0, 1.6]");
    super({ alpha, K });
  }

  compute(x: Float64Array, weights: Float64Array): number {
    const alpha = this.parameters.alpha as number;
    let K = this.parameters.K as number | null;
    if (K === null || K === undefined) K = 1 / (2 * 0.5 ** (2 + alpha));

    // weights ** (1 + alpha) * weights[:, None] * |x[:, None] − x|, summed row-major:
    // element [i][j] = (wⱼ^(1+α) · wᵢ) · |xᵢ − xⱼ|
    const n = weights.length;
    const powered = weights.map((w) => w ** (1 + alpha));
    const terms = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      const wi = weights[i] as number;
      const xi = x[i] as number;
      for (let j = 0; j < n; j++) {
        terms[i * n + j] = (powered[j] as number) * wi * Math.abs(xi - (x[j] as number));
      }
    }
    return K * npSum(terms);
  }
}
