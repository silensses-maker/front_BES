/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/metrics/literature/van_der_eijk.py
 * Reference: [5] Van der Eijk, "Measuring agreement in ordered rating scales", Quality and
 * Quantity 35(3) (2001).
 *
 * The histogram is peeled into layers (each layer removes the smallest non-zero frequency from
 * every non-empty category). Each layer's pattern gets an agreement
 *   A = U · (1 − (S − 1)/(K − 1)),
 *   U = ((K − 2)·TU − (K − 1)·TDU) / ((K − 2)·(TU + TDU))   (U = 1 when TU = TDU = 0),
 * with S non-empty categories, TU unimodal (110/011) and TDU bimodal (101) triplets. The overall
 * agreement is the layer-weighted mean, and
 *   Eijk_pol(M) = 1 − (1 + A) / 2.
 * Fewer than 3 categories: undefined (NaN, the package only prints a warning).
 */

import { PolarizationMeasure } from "../base";
import { valueError } from "../errors";
import { npSum } from "../np";

function patternVector(values: Float64Array): Float64Array {
  const pattern = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) if ((values[i] as number) > 0) pattern[i] = 1;
  return pattern;
}

function minNonZero(values: Float64Array): number {
  let best = Number.POSITIVE_INFINITY;
  for (const v of values) if (v > 0 && v < best) best = v;
  return best;
}

function patternAgreement(pattern: Float64Array): number {
  const K = pattern.length;
  let TDU = 0;
  let TU = 0;
  for (let i = 0; i < K - 2; i++) {
    for (let j = i + 1; j < K - 1; j++) {
      for (let m = j + 1; m < K; m++) {
        const pi = pattern[i];
        const pj = pattern[j];
        const pm = pattern[m];
        if (pi === 1 && pj === 0 && pm === 1) TDU += 1; // 101 pattern, bimodal
        if (pi === 1 && pj === 1 && pm === 0) TU += 1; // 110 pattern, unimodal
        if (pi === 0 && pj === 1 && pm === 1) TU += 1; // 011 pattern, unimodal
      }
    }
  }

  const U = TU === 0 && TDU === 0 ? 1 : ((K - 2) * TU - (K - 1) * TDU) / ((K - 2) * (TU + TDU));
  const S = npSum(pattern);
  let A = U * (1 - (S - 1) / (K - 1));
  if (Number.isNaN(A)) A = 0;
  if (S === 1) A = 1;
  return A;
}

export class VanDerEijkPol extends PolarizationMeasure {
  protected readonly className = "VanDerEijkPol";

  compute(_x: Float64Array, weights: Float64Array): number {
    if (weights.length < 3) return Number.NaN;
    for (const w of weights) {
      if (w < 0) throw valueError("Error: negative values found in frequency vector.");
    }

    let AA = 0;
    const N = npSum(weights);
    const R = Float64Array.from(weights);
    const layer = new Float64Array(R.length);

    for (let iteration = 0; iteration < weights.length; iteration++) {
      const P = patternVector(R);
      let maxP = 0;
      for (const p of P) if (p > maxP) maxP = p;
      if (maxP === 0) break;

      const A = patternAgreement(P);
      const m = minNonZero(R);
      for (let i = 0; i < R.length; i++) layer[i] = (P[i] as number) * m;
      const w = npSum(layer) / N;
      AA += w * A;
      for (let i = 0; i < R.length; i++) R[i] = (R[i] as number) - (layer[i] as number);
    }

    return 1 - (1 + AA) * 0.5;
  }
}
