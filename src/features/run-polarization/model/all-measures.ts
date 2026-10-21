import type { PolarizationMeasureInfo } from "@/shared/api/backend";
import type { BeliefKind } from "@/shared/lib/polarization";
import type { SeriesSpec } from "./polarization-series";
import { effectiveParams, type ParamValues } from "./polarization-settings.store";
import type { SpecEntry } from "./series-scheduler";

/**
 * The table's "all measures" mode (#129): every measure of the server's catalog with its DEFAULT
 * parameters (the package's), for one k and belief type. A measure not defined for that k (the
 * catalog's `categories`: Experts only k = 5, Van der Eijk k ≥ 3) gets no spec, hence no request.
 * These specs go through the same series model, cache and scheduler as the compared series.
 */

export interface MeasureSpec {
  meta: PolarizationMeasureInfo;
  /** The catalog's defaults. */
  params: ParamValues;
  /** The measure is defined for k. */
  supported: boolean;
  /** What to request; null when the measure is not defined for k. */
  spec: SeriesSpec | null;
}

/** Every catalog measure (in catalog order) with its defaults, for `k` and `belief`. */
export function allMeasureSpecs(
  measures: readonly PolarizationMeasureInfo[],
  k: number,
  belief: BeliefKind,
): MeasureSpec[] {
  return measures.map((meta) => {
    const params = effectiveParams(meta, {});
    const supported = meta.categories.includes(k);
    return {
      meta,
      params,
      supported,
      spec: supported ? { measureId: meta.id, params, k, belief } : null,
    };
  });
}

/**
 * Scheduler entries of the measures. Their ids are negative (-1, -2, …, by catalog position) so
 * they never collide with the compared series' ids (positive), and changing k or the belief type
 * debounces each measure like a compared series' edit.
 */
export function allMeasureEntries(specs: readonly MeasureSpec[]): SpecEntry[] {
  return specs.map((item, index) => ({ id: -1 - index, spec: item.spec }));
}
