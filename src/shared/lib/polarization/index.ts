/**
 * Polarization measures — TypeScript REPLICA of pol_measures (#129).
 *
 * Ported from ulvenforst/pol_measures @ 0e05564ed0b7 (PROMUEVA; package author Juan Camilo
 * Narváez Tascón, BiPol implemented by Carlos Pinzón), used with the authors' permission. Each
 * file names the Python module it ports; golden tests (golden.test.ts) check every measure
 * against values produced by the real package (scripts/generate-pol-measures-golden.py).
 *
 * Isolation: this folder and src/features/run-polarization/ hold the whole replica. It is
 * compiled in only while the build flag `__POLARIZATION__` is on (PUBLIC_ENABLE_POLARIZATION,
 * default on; "false" turns it off and the bundler drops this code). See README, "Polarization
 * measures (replica)", for the integration points to remove.
 *
 * FUTURE WORK: consume pol_measures directly — a pinned version of the Python package, e.g. a
 * small service behind the backend — instead of maintaining this replica.
 */

export { ALIENATION_IDS, ALIENATION_TEX, type AlienationId, isAlienationId } from "./alienation";
export type { AllClassifications, PolarizationMeasure } from "./base";
export { NO_CLASSIFICATION } from "./base";
export {
  accumulateFineHistogram,
  CATEGORY_COUNTS,
  type CategoryCount,
  categoryIndex,
  categoryPositions,
  DEFAULT_CATEGORY_COUNT,
  FINE_BINS,
  fineBinIndex,
  isCategoryCount,
  rebinCounts,
} from "./binning";
export { type Classifier, UI_CLASSIFICATION, uiClassifier } from "./classification";
export { isPolarizationError, PolarizationError } from "./errors";
export { createMeasure } from "./factory";
export { type BeliefKind, FineHistogramPool } from "./fine-histograms";
export {
  DEFAULT_MEASURE,
  defaultParams,
  isInRange,
  isMeasureId,
  LITERATURE_MEASURES,
  MEASURE_IDS,
  MEASURES,
  type MeasureId,
  type MeasureKind,
  type MeasureMeta,
  type MeasureParams,
  type ParamSpec,
  PROPOSED_MEASURES,
  REFERENCES,
  type Reference,
  type ReferenceId,
  supportsCategories,
} from "./registry";
export {
  PolarizationSeries,
  PolarizationSeriesCache,
  type SeriesSpec,
  seriesCacheFor,
  seriesKey,
} from "./series";
export { POL_MEASURES_SOURCE } from "./source";
export { CATEGORY_LABELS, type ClassificationMethod, THRESHOLDS } from "./thresholds";
