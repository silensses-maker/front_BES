import type { PolarizationMeasureInfo } from "@/shared/api/backend";
import type { BeliefKind } from "@/shared/lib/polarization";
import type { CsvColumn } from "../lib/polarization-csv";
import { csvLabel } from "../lib/polarization-csv";
import { uniqueLabels } from "../lib/series-label";
import type { MeasureSpec } from "./all-measures";
import type { ComparedSeries } from "./compared-series";
import { type PolarizationSeries, type SeriesSpec, seriesKey } from "./polarization-series";
import type { ParamValues } from "./polarization-settings.store";

/**
 * The columns of the polarization table (#129): one per compared series ("series" mode, what the
 * chart shows) or per catalog measure ("all measures"), each with the series model that holds its
 * per-round values (null while it has none: unsupported k, or no histograms yet).
 */
export interface TableColumn extends CsvColumn {
  /** React key. */
  key: string;
  /** Header on screen: the series' label, or the measure's name. */
  label: string;
  /** The series' colour ("series" mode), null for the measures. */
  color: string | null;
  meta: PolarizationMeasureInfo;
  params: ParamValues;
  k: number;
  belief: BeliefKind;
  series: PolarizationSeries | null;
  /** Index of its series in the list hook's entries (for `retry`). */
  listIndex: number;
}

/**
 * The series of a column when it holds the column's spec. While an edit is debounced the list
 * still has the previous spec's series: the column shows nothing (pending) rather than values
 * under a header and an export row that describe another spec.
 */
function matching(
  model: PolarizationSeries | null | undefined,
  spec: SeriesSpec | null,
): PolarizationSeries | null {
  if (model == null || spec === null) return null;
  return model.key === seriesKey(spec) ? model : null;
}

/** `csvLabel` of every column, made unique. */
function withCsvLabels(columns: Array<Omit<TableColumn, "csvLabel">>): TableColumn[] {
  const labels = uniqueLabels(columns.map((column) => csvLabel(column)));
  return columns.map((column, index) => ({ ...column, csvLabel: labels[index] ?? "" }));
}

/** The compared series as columns (their series are the hook's first entries, in order). */
export function seriesColumns(
  compared: readonly ComparedSeries[],
  series: ReadonlyArray<PolarizationSeries | null>,
): TableColumn[] {
  return withCsvLabels(
    compared.map((item, index) => ({
      key: `series-${item.config.id}`,
      label: item.label,
      color: item.color,
      meta: item.meta,
      params: item.params,
      k: item.config.k,
      belief: item.config.belief,
      supported: item.supported,
      series: matching(series[index], item.spec),
      listIndex: index,
    })),
  );
}

/** The catalog measures as columns; their series follow the compared ones (`offset`). */
export function measureColumns(
  specs: readonly MeasureSpec[],
  k: number,
  belief: BeliefKind,
  series: ReadonlyArray<PolarizationSeries | null>,
  offset: number,
): TableColumn[] {
  const names = uniqueLabels(specs.map((item) => item.meta.name));
  return withCsvLabels(
    specs.map((item, index) => ({
      key: `measure-${item.meta.id}`,
      label: names[index] ?? item.meta.name,
      color: null,
      meta: item.meta,
      params: item.params,
      k,
      belief,
      supported: item.supported,
      series: matching(series[offset + index], item.spec),
      listIndex: offset + index,
    })),
  );
}

/**
 * Whether an export holds only part of the run: the run is live, or a column defined for its k
 * has not been computed over every recorded round yet (loading, waiting, or stopped on an error).
 */
export function isPartial(
  columns: readonly TableColumn[],
  recorded: number,
  live: boolean,
): boolean {
  if (live) return true;
  return columns.some(
    (column) =>
      column.supported &&
      (column.series === null ||
        column.series.status === "loading" ||
        column.series.answered < recorded),
  );
}
