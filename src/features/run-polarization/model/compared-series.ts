import type { PolarizationMeasureInfo } from "@/shared/api/backend";
import { CATEGORY_COUNTS, type CategoryCount } from "@/shared/lib/polarization";
import type { PolarizationErrorInfo } from "../lib/polarization-error";
import { type SeriesLabelText, seriesLabel, uniqueLabels } from "../lib/series-label";
import type { PolarizationSeries, SeriesSpec } from "./polarization-series";
import { effectiveParams, type ParamValues, selectedMeasure } from "./polarization-settings.store";
import type { SeriesConfig } from "./series-list";

/** A compared series as the view shows it (#129): its catalog measure, spec, label and colour. */
export interface ComparedSeries {
  config: SeriesConfig;
  meta: PolarizationMeasureInfo;
  /** Effective parameters (the catalog's defaults overridden by the edited ones). */
  params: ParamValues;
  /** The measure is defined for the series' k (Experts: only k = 5). */
  supported: boolean;
  /** What to request; null when the measure is not defined for k. */
  spec: SeriesSpec | null;
  /** Unique short label (chip, legend, tooltip). */
  label: string;
  color: string;
  /** First offered k the measure supports (the "Use k = …" action), null when none. */
  firstSupportedK: CategoryCount | null;
}

/**
 * Resolves the configured series against the server's catalog (which has at least one measure):
 * an unknown measure id falls back like the single-series view did (DEFAULT_MEASURE, else the
 * first measure). Colours come from `palette` by each series' slot.
 */
export function compareSeries(
  measures: readonly PolarizationMeasureInfo[],
  configs: readonly SeriesConfig[],
  text: SeriesLabelText,
  palette: readonly string[],
): ComparedSeries[] {
  const resolved = configs.map((config) => {
    const meta = selectedMeasure(measures, config.measureId) as PolarizationMeasureInfo;
    const params = effectiveParams(meta, config.paramsByMeasure);
    const supported = meta.categories.includes(config.k);
    return {
      config,
      meta,
      params,
      supported,
      spec: supported ? { measureId: meta.id, params, k: config.k, belief: config.belief } : null,
      label: seriesLabel({ measure: meta, params, k: config.k, belief: config.belief }, text),
      color: palette[config.slot % Math.max(1, palette.length)] ?? "",
      firstSupportedK: CATEGORY_COUNTS.find((count) => meta.categories.includes(count)) ?? null,
    };
  });
  const labels = uniqueLabels(resolved.map((item) => item.label));
  return resolved.map((item, index) => ({ ...item, label: labels[index] ?? item.label }));
}

/** What keeps a compared series off the chart (or stopped), for its notice. */
export type SeriesProblem =
  | { kind: "unsupported" }
  | { kind: "invalid"; message: string | null }
  | { kind: "error"; error: PolarizationErrorInfo | null };

/** The problem of a compared series given its model (null = none). */
export function problemOf(
  item: ComparedSeries,
  series: PolarizationSeries | null,
): SeriesProblem | null {
  if (!item.supported) return { kind: "unsupported" };
  if (series?.status !== "error") return null;
  if (series.error?.kind === "invalid") return { kind: "invalid", message: series.error.message };
  return { kind: "error", error: series.error };
}
