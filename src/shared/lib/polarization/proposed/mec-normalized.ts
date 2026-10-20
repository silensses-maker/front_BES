/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/proposed/mec.py (`MECNormalized` — the README notes it is "still
 * being developed": BETA in the UI).
 * Reference: arXiv:2606.13997 (MEC), see ./mec.ts.
 *
 *   MEC*_{α,β}(M) = MEC_{α,β}(M)^(1/β) / MEC_{α,β}(π*)^(1/β)
 *
 * π* is the extreme distribution: half the mass at x₁ and half at xₙ. Both minima use SciPy's
 * bounded search on (0, 1). Thresholds exist for α = 2, β = 1.15.
 */

import { ParametricPolarizationMeasure } from "../base";
import { validateParameters } from "../validation";
import { minimalEffort } from "./mec";

export class MECNormalized extends ParametricPolarizationMeasure {
  protected readonly className = "MECNormalized";
  protected readonly alpha: number;
  protected readonly beta: number;

  constructor(alpha = 2, beta = 1.15) {
    super({ alpha, beta });
    this.alpha = alpha;
    this.beta = beta;
  }

  compute(x: Float64Array, weights: Float64Array): number {
    validateParameters(this.parameters);
    const minF = minimalEffort(x, weights, this.alpha, this.beta);

    const xMax = Float64Array.of(x[0] as number, x[x.length - 1] as number);
    const wMax = Float64Array.of(0.5, 0.5);
    const minFMax = minimalEffort(xMax, wMax, this.alpha, this.beta);

    return minF ** (1 / this.beta) / minFMax ** (1 / this.beta);
  }
}
