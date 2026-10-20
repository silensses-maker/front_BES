/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/thresholds.py — classification boundaries, from the article the file links
 * ("Bridging theory and expert judgment: advances in polarization metrics and their empirical
 * correlations", ulvenforst.vercel.app). A value below `thresholds[i]` gets `labels[i]`;
 * otherwise it gets the last label.
 *
 * Only EstebanRay (alpha = 0.8), BiPol and MECNormalized (alpha = 2, beta = 1.15) have thresholds.
 * The Python dict nests parametrized measures as `{ _params: {set: params}, set: {method: …} }`;
 * here that shape is `{ params, sets }` so it can be typed, with the same contents.
 */

export type ClassificationMethod = "kmeans" | "percentile";

/** method → number of categories → ascending boundaries (n − 1 of them). */
export type ThresholdsByMethod = Readonly<
  Partial<Record<ClassificationMethod, Readonly<Record<number, readonly number[]>>>>
>;

export interface ParametrizedThresholds {
  /** Parameter set name → the parameter values the set was calibrated for. */
  readonly params: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly sets: Readonly<Record<string, ThresholdsByMethod>>;
}

export type MeasureThresholds = ThresholdsByMethod | ParametrizedThresholds;

export function isParametrized(entry: MeasureThresholds): entry is ParametrizedThresholds {
  return "params" in entry;
}

export const THRESHOLDS: Readonly<Record<string, MeasureThresholds>> = {
  EstebanRay: {
    params: { default: { alpha: 0.8 } },
    sets: {
      default: {
        kmeans: {
          3: [0.3791, 0.5141],
          4: [0.3501, 0.4467, 0.566],
          5: [0.3196, 0.3973, 0.4809, 0.5921],
        },
        percentile: {
          3: [0.3609, 0.4466],
          4: [0.3407, 0.4031, 0.4761],
          5: [0.3275, 0.3781, 0.4295, 0.4965],
        },
      },
    },
  },
  BiPol: {
    kmeans: {
      3: [0.4525, 0.6267],
      4: [0.394, 0.5317, 0.6702],
      5: [0.3543, 0.473, 0.5816, 0.7024],
    },
    percentile: {
      3: [0.4726, 0.5994],
      4: [0.438, 0.5376, 0.6383],
      5: [0.414, 0.5, 0.5756, 0.6627],
    },
  },
  MECNormalized: {
    params: { default: { alpha: 2.0, beta: 1.15 } },
    sets: {
      default: {
        kmeans: {
          3: [0.2233, 0.3801],
          4: [0.1718, 0.2841, 0.4271],
          5: [0.1513, 0.2421, 0.3369, 0.4689],
        },
        percentile: {
          3: [0.1971, 0.2922],
          4: [0.1747, 0.2408, 0.3274],
          5: [0.1581, 0.2141, 0.2716, 0.3503],
        },
      },
    },
  },
};

export const CATEGORY_LABELS: Readonly<Record<number, readonly string[]>> = {
  2: ["low", "high"],
  3: ["low", "medium", "high"],
  4: ["very_low", "low", "high", "very_high"],
  5: ["very_low", "low", "medium", "high", "very_high"],
};

/** Labels for `numCategories`, falling back to category_1…category_n like the package. */
export function categoryLabels(numCategories: number): readonly string[] {
  return (
    CATEGORY_LABELS[numCategories] ??
    Array.from({ length: numCategories }, (_, i) => `category_${i + 1}`)
  );
}
