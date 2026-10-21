/**
 * Polarization (#129) — the client side of the polarization measures: per-round 210-bin
 * histograms of the agents' beliefs and their k-category counts.
 *
 * The measures themselves are computed on the server by the real pol_measures package
 * (ulvenforst/pol_measures, PROMUEVA), pinned in the backend image: see the backend's
 * `POST /simulations/polarization` and `simulationsApi.computePolarization`. Nothing here
 * computes a measure.
 *
 * Compiled in only while the build flag `__POLARIZATION__` is on (PUBLIC_ENABLE_POLARIZATION,
 * default on; "false" turns it off and the bundler drops this code). See README, "Polarization
 * measures".
 */

export {
  accumulateFineHistogram,
  CATEGORY_COUNTS,
  type CategoryCount,
  categoryIndex,
  DEFAULT_CATEGORY_COUNT,
  FINE_BINS,
  fineBinIndex,
  isCategoryCount,
  rebinCounts,
} from "./binning";
export { type BeliefKind, FineHistogramPool } from "./fine-histograms";
export { POL_MEASURES_SOURCE } from "./source";
