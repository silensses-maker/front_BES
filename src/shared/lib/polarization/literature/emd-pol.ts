/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/emd.py (`EMDPol`; the unexported `EMDPolSciPy` variant
 * is not ported).
 * Reference: [1] Lupu, Selios & Warner, "A new measure of congruence: The Earth Mover's Distance",
 * Political Analysis 25(1) (2017).
 *
 *   EMD_pol(M) = 0.5 − EMD(M, π_max),   π_max = half the mass at each extreme
 *
 * The transport is computed greedily: 0.5 of mass is moved from the left end and 0.5 from the
 * right end, each at cost mass · (bins travelled)/(n − 1). Positions only enter through their
 * index, i.e. the categories are assumed equally spaced.
 */

import { PolarizationMeasure } from "../base";
import { pyMin } from "../np";

export class EMDPol extends PolarizationMeasure {
  protected readonly className = "EMDPol";

  compute(_x: Float64Array, weights: Float64Array): number {
    const n = weights.length;
    let leftMass = 0.5;
    let rightMass = 0.5;
    let totalCost = 0;

    // Move from left
    for (let i = 0; i < n; i++) {
      let targetMass = weights[i] as number;
      if (leftMass > 0) {
        const massToMove = pyMin(leftMass, targetMass);
        totalCost += (massToMove * i) / (n - 1);
        leftMass -= massToMove;
        targetMass -= massToMove;
      }
      if (targetMass > 0 && leftMass === 0) break;
    }

    // Move from right
    for (let i = n - 1; i >= 0; i--) {
      let targetMass = weights[i] as number;
      if (rightMass > 0) {
        const massToMove = pyMin(rightMass, targetMass);
        totalCost += (massToMove * (n - 1 - i)) / (n - 1);
        rightMass -= massToMove;
        targetMass -= massToMove;
      }
      if (targetMass > 0 && rightMass === 0) break;
    }

    return 0.5 - totalCost;
  }
}
