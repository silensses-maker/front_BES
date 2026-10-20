/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/generalized_er.py
 * Reference: Esteban–Ray with a configurable alienation function, as proposed in "Revisiting the
 * Measurement of Polarization" (cited by the package's docstring).
 *
 *   ER_{α,f}(M) = K Σᵢ Σⱼ πᵢ^(1+α) πⱼ f(|xᵢ − xⱼ|),   K = 1 / (2 · 0.5^(2+α) · f(d_max))
 *
 * d_max = max(x) − min(x), so the extreme 50/50 split at the endpoints scores 1. f defaults to the
 * identity (then it equals EstebanRay, but α is only required to be positive). Only α is a
 * "parameter" for threshold lookup; f and K are not (there are no thresholds for it anyway).
 */

import type { Alienation } from "../alienation";
import { ParametricPolarizationMeasure } from "../base";
import { valueError } from "../errors";
import { npMax, npMin, npSum } from "../np";

export class GeneralizedER extends ParametricPolarizationMeasure {
  protected readonly className = "GeneralizedER";
  private readonly alienation: Alienation;
  private readonly K: number | null;

  constructor(alpha = 0.8, alienation: Alienation | null = null, K: number | null = null) {
    if (alpha <= 0) throw valueError("alpha must be positive");
    super({ alpha });
    this.alienation = alienation ?? ((d) => d);
    this.K = K;
  }

  compute(x: Float64Array, weights: Float64Array): number {
    const alpha = this.parameters.alpha as number;
    const n = weights.length;

    let K = this.K;
    if (K === null) {
      const dMax = npMax(x) - npMin(x);
      const fDmax = this.alienation(dMax);
      K = 1.0 / (2.0 * 0.5 ** (2.0 + alpha) * fDmax);
    }

    // W_i * W_j * f(|x[:, None] − x|): element [i][j] = (wᵢ^(1+α) · wⱼ) · f(|xᵢ − xⱼ|)
    const terms = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      const wiPowered = (weights[i] as number) ** (1 + alpha);
      const xi = x[i] as number;
      for (let j = 0; j < n; j++) {
        terms[i * n + j] =
          wiPowered * (weights[j] as number) * this.alienation(Math.abs(xi - (x[j] as number)));
      }
    }
    return K * npSum(terms);
  }
}
