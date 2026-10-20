/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/proposed/generalized_mec.py
 * Reference: arXiv:2606.13997 (MEC), see ./mec.ts.
 *
 *   GMEC_{α,f}(M) = min_{y ∈ [0,1]} Σᵢ πᵢ^α f(|xᵢ − y|)
 *
 * MEC with a configurable alienation function f (identity by default, i.e. MEC with β = 1;
 * f(d) = d^β gives MEC_{α,β}). f must return finite, non-negative values.
 */

import type { Alienation } from "../alienation";
import { ParametricPolarizationMeasure } from "../base";
import { valueError } from "../errors";
import { npSum } from "../np";
import { minimizeScalarBounded } from "../optimization";
import { validateParameters } from "../validation";

export class GeneralizedMEC extends ParametricPolarizationMeasure {
  protected readonly className = "GeneralizedMEC";
  private readonly alienation: Alienation;

  constructor(alpha = 2.0, alienation: Alienation | null = null) {
    if (alpha <= 0) throw valueError("alpha must be positive");
    super({ alpha });
    this.alienation = alienation ?? ((d) => d);
  }

  private applyAlienation(distance: number): number {
    const value = this.alienation(distance);
    if (!Number.isFinite(value)) throw valueError("Alienation function must return finite values.");
    return value;
  }

  compute(x: Float64Array, weights: Float64Array): number {
    const alpha = this.parameters.alpha as number;
    validateParameters({ alpha });

    const weightsAlpha = weights.map((w) => w ** alpha);
    const transformed = new Float64Array(x.length);
    const terms = new Float64Array(x.length);
    const objective = (y: number): number => {
      // _apply_alienation checks the whole vector (finite first, then non-negative)
      for (let i = 0; i < x.length; i++) {
        transformed[i] = this.applyAlienation(Math.abs((x[i] as number) - y));
      }
      for (const value of transformed) {
        if (value < 0) throw valueError("Alienation function must be non-negative.");
      }
      for (let i = 0; i < x.length; i++) {
        terms[i] = (weightsAlpha[i] as number) * (transformed[i] as number);
      }
      return npSum(terms);
    };
    return minimizeScalarBounded(objective, [0, 1]).fun;
  }
}
