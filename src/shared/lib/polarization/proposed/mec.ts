/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/proposed/mec.py (`MEC`)
 * Reference: Aranda, Díaz, Narváez, Palamidessi, Pinzón, Valencia & Vargas, "Minimal Effort to
 * Consensus (MEC) polarization measure", arXiv:2606.13997 (2026).
 *
 *   MEC_{α,β}(M) = min_{y ∈ [0,1]} Σᵢ πᵢ^α |xᵢ − y|^β
 *
 * The minimum effort of moving the whole distribution to a single consensus point y. The minimum
 * is found exactly like the package: SciPy's bounded Brent search on (0, 1), xatol = 1e-5.
 * α (group identity) and β (alienation) must be positive (checked at compute time). Like the
 * package, `compute` uses the constructor's α and β; `updateParameters` only affects validation
 * and threshold lookup.
 */

import { ParametricPolarizationMeasure } from "../base";
import { npSum } from "../np";
import { minimizeScalarBounded } from "../optimization";
import { validateParameters } from "../validation";

/** min over y ∈ [0, 1] of Σᵢ wᵢ^α |xᵢ − y|^β via SciPy's bounded method; returns `result.fun`. */
export function minimalEffort(
  x: Float64Array,
  weights: Float64Array,
  alpha: number,
  beta: number,
): number {
  const weightsAlpha = weights.map((w) => w ** alpha);
  const terms = new Float64Array(x.length);
  const objective = (y: number): number => {
    for (let i = 0; i < x.length; i++) {
      terms[i] = (weightsAlpha[i] as number) * Math.abs((x[i] as number) - y) ** beta;
    }
    return npSum(terms);
  };
  return minimizeScalarBounded(objective, [0, 1]).fun;
}

export class MEC extends ParametricPolarizationMeasure {
  protected readonly className = "MEC";
  protected readonly alpha: number;
  protected readonly beta: number;

  constructor(alpha = 2, beta = 1.15) {
    super({ alpha, beta });
    this.alpha = alpha;
    this.beta = beta;
  }

  compute(x: Float64Array, weights: Float64Array): number {
    validateParameters(this.parameters);
    return minimalEffort(x, weights, this.alpha, this.beta);
  }
}
