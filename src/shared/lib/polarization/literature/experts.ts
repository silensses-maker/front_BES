/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/experts.py
 * Reference: [2] Koudenburg, Kiers & Kashima, "A new opinion polarization index developed by
 * integrating expert judgments", Frontiers in Psychology 12 (2021) 738258.
 *
 *   Experts(M) = (2.14 π₂π₄ + 2.70 (π₁π₄ + π₂π₅) + 3.96 π₁π₅) / (0.0099 (Σπ)²) / 100
 *
 * Regression on 60 experts' ratings of 15 five-point Likert histograms: only defined for exactly
 * 5 categories (the package raises otherwise).
 */

import { PolarizationMeasure } from "../base";
import { valueError } from "../errors";
import { npSum } from "../np";

export class Experts extends PolarizationMeasure {
  protected readonly className = "Experts";

  compute(x: Float64Array, weights: Float64Array): number {
    if (x.length !== 5) {
      throw valueError("Experts measure was designed only for 5-category histograms");
    }
    const w = (i: number) => weights[i] as number;
    const n2n4Term = 2.14 * w(1) * w(3);
    const n1n4n2n5Term = 2.7 * (w(0) * w(3) + w(1) * w(4));
    const n1n5Term = 3.96 * w(0) * w(4);

    const numerator = n2n4Term + n1n4n2n5Term + n1n5Term;
    const denominator = 0.0099 * npSum(weights) ** 2;

    return numerator / denominator / 100;
  }
}
