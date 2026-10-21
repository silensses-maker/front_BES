import type { PolarizationMeasureInfo } from "@/shared/api/backend";
import { CATEGORY_COUNTS, type CategoryCount } from "@/shared/lib/polarization";
import type { PolarizationErrorInfo } from "../lib/polarization-error";
import {
  joinLabel,
  type SeriesLabelText,
  seriesLabelParts,
  uniqueLabels,
} from "../lib/series-label";
import { type LineDash, slotStyle } from "../lib/series-style";
import type { PolarizationSeries, SeriesSpec } from "./polarization-series";
import { effectiveParams, type ParamValues, selectedMeasure } from "./polarization-settings.store";
import type { SeriesConfig } from "./series-list";

/**
 * A compared series as the view shows it (#129): its catalog measure, spec, label, colour and
 * line style.
 */
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
  /**
   * Unique label without k and the belief type when every series shares them (sharedSettings),
   * for the compact chips; otherwise the label.
   */
  shortLabel: string;
  color: string;
  /** Line style of its slot (series-style.ts). */
  dash: LineDash;
  /** First offered k the measure supports (the "Use k = …" action), null when none. */
  firstSupportedK: CategoryCount | null;
}

/** Whether every series reads the same k and belief type. */
function sharesSettings(configs: readonly SeriesConfig[]): boolean {
  const first = configs[0];
  return first !== undefined && configs.every((c) => c.k === first.k && c.belief === first.belief);
}

/**
 * The k and belief type every series shares (e.g. "k=5 · private"), shown once next to the
 * compact chips whose labels leave them out; null when the series differ.
 */
export function sharedSettings(
  configs: readonly SeriesConfig[],
  text: Pick<SeriesLabelText, "belief">,
): string | null {
  const first = configs[0];
  if (first === undefined || !sharesSettings(configs)) return null;
  return joinLabel([`k=${first.k}`, text.belief(first.belief)]);
}

/**
 * Resolves the configured series against the server's catalog (which has at least one measure):
 * an unknown measure id falls back like the single-series view did (DEFAULT_MEASURE, else the
 * first measure). Colours (from `palette`) and line styles come from each series' slot.
 */
export function compareSeries(
  measures: readonly PolarizationMeasureInfo[],
  configs: readonly SeriesConfig[],
  text: SeriesLabelText,
  palette: readonly string[],
): ComparedSeries[] {
  const shared = sharesSettings(configs);
  const resolved = configs.map((config) => {
    const meta = selectedMeasure(measures, config.measureId) as PolarizationMeasureInfo;
    const params = effectiveParams(meta, config.paramsByMeasure);
    const supported = meta.categories.includes(config.k);
    const parts = seriesLabelParts(
      { measure: meta, params, k: config.k, belief: config.belief },
      text,
    );
    const style = slotStyle(config.slot);
    const label = joinLabel([parts.measure, parts.k, parts.belief, ...parts.params]);
    return {
      config,
      meta,
      params,
      supported,
      spec: supported ? { measureId: meta.id, params, k: config.k, belief: config.belief } : null,
      label,
      shortLabel: shared ? joinLabel([parts.measure, ...parts.params]) : label,
      color: palette[style.colorIndex % Math.max(1, palette.length)] ?? "",
      dash: style.dash,
      firstSupportedK: CATEGORY_COUNTS.find((count) => meta.categories.includes(count)) ?? null,
    };
  });
  const labels = uniqueLabels(resolved.map((item) => item.label));
  const shortLabels = uniqueLabels(resolved.map((item) => item.shortLabel));
  return resolved.map((item, index) => ({
    ...item,
    label: labels[index] ?? item.label,
    shortLabel: shortLabels[index] ?? item.shortLabel,
  }));
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
