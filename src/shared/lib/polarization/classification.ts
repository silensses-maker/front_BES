/**
 * Polarization replica (#129) — the classification scheme the run charts show.
 *
 * pol_measures classifies with `measure(x, w, labels=n, method="kmeans")`; `kmeans` is its default
 * method and n has no default. The UI uses kmeans with 3 levels (low / medium / high), the scheme
 * the package's own tests exercise. Thresholds only apply when `findMatchingParameterSet` matches
 * (EstebanRay α = 0.8, MECNormalized α = 2 β = 1.15, BiPol); otherwise there is no level.
 */

import type { PolarizationMeasure } from "./base";
import { type ClassificationMethod, categoryLabels } from "./thresholds";

export const UI_CLASSIFICATION: { method: ClassificationMethod; categories: number } = {
  method: "kmeans",
  categories: 3,
};

export interface Classifier {
  paramSet: string;
  thresholds: readonly number[];
  labels: readonly string[];
  /** Level of a value (null for NaN / non-finite values, which have no level). */
  levelOf: (value: number) => string | null;
}

/** The UI classifier for a measure instance, or null when the package has no thresholds for it. */
export function uiClassifier(measure: PolarizationMeasure): Classifier | null {
  const paramSet = measure.findMatchingParameterSet();
  if (paramSet === null) return null;
  let thresholds: readonly number[];
  try {
    thresholds = measure.getThresholds(
      UI_CLASSIFICATION.categories,
      UI_CLASSIFICATION.method,
      paramSet,
    );
  } catch {
    return null;
  }
  return {
    paramSet,
    thresholds,
    labels: categoryLabels(UI_CLASSIFICATION.categories),
    levelOf: (value) =>
      Number.isFinite(value)
        ? measure.classifyValue(
            value,
            UI_CLASSIFICATION.categories,
            UI_CLASSIFICATION.method,
            paramSet,
          )
        : null,
  };
}
