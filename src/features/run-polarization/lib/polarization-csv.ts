import type { PolarizationParamValue } from "@/shared/api/backend";
import type { BeliefKind } from "@/shared/lib/polarization";
import type { RoundSource } from "./polarization-table";

/**
 * CSV export of the polarization table (#129), for research: the file conventions are the data
 * table's (`@/shared/lib/csv`: `;`, UTF-8 BOM, quotes only when needed) and every value is
 * language-neutral (dot decimals, raw level ids, English headers).
 *
 *  - long (R / pandas): one row per round × series that has been computed;
 *  - wide (Excel): one row per listed round, a value column per series (plus its level column
 *    when the series has thresholds).
 *
 * Measure values keep full precision: JavaScript's shortest round-trip representation (what
 * `String(number)` gives), so parsing the file gives back exactly the server's double. The
 * pol_measures version and commit the server computed with go in every row (reproducibility).
 */

export type CsvFormat = "long" | "wide";

/** A series as the export reads it (PolarizationSeries implements it). */
export interface CsvSeries extends RoundSource {
  /** Thresholds that apply to the series' parameters (null = no level column). */
  readonly classification: object | null;
  readonly packageVersion: string | null;
  readonly packageRef: string | null;
}

/** One column of the table: a compared series, or a catalog measure. */
export interface CsvColumn {
  /** Unique, language-neutral label (the wide format's header). */
  csvLabel: string;
  /** The catalog measure: its id and its parameters in catalog order. */
  meta: { id: string; params: ReadonlyArray<{ name: string; default: PolarizationParamValue }> };
  /** Effective parameters. */
  params: Readonly<Record<string, PolarizationParamValue>>;
  k: number;
  belief: BeliefKind;
  /** The measure is defined for k (unsupported columns have no data and are left out). */
  supported: boolean;
  series: CsvSeries | null;
}

export interface CsvContext {
  runId: string;
  networkId: string;
  /** The catalog's package, for a series that has not reported one. */
  fallbackPackage: { version: string; ref: string } | null;
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export const LONG_HEADERS: readonly string[] = [
  "run_id",
  "network_id",
  "round",
  "measure",
  "params",
  "k",
  "belief",
  "value",
  "level",
  "pol_measures_version",
  "pol_measures_ref",
];

const PACKAGE_HEADERS = ["pol_measures_version", "pol_measures_ref"] as const;

/** A measure value with full precision (shortest round-trip, dot decimal). */
export function csvNumber(value: number): string {
  return String(value);
}

function paramValueText(value: PolarizationParamValue | undefined): string {
  if (value === null || value === undefined) return "null";
  return typeof value === "number" ? csvNumber(value) : value;
}

/**
 * The parameters as a stable `name=value` list joined with `,`, in the catalog's order (the
 * package's signature): numbers with full precision, f(d) by its id, an empty nullable one
 * (K = automatic) as `null`. Empty for a measure without parameters.
 */
export function paramsText(column: Pick<CsvColumn, "meta" | "params">): string {
  return column.meta.params
    .map((spec) => `${spec.name}=${paramValueText(column.params[spec.name])}`)
    .join(",");
}

/**
 * The language-neutral label of a column: the measure id, k, the belief type and the parameters
 * that differ from the package's defaults, e.g. `MEC (k=5, public, alpha=1.5)`. Make the labels
 * of a table unique with `uniqueLabels`.
 */
export function csvLabel(column: Pick<CsvColumn, "meta" | "params" | "k" | "belief">): string {
  const parts = [`k=${column.k}`, column.belief];
  for (const spec of column.meta.params) {
    const value = column.params[spec.name] ?? null;
    if (value !== spec.default) parts.push(`${spec.name}=${paramValueText(value)}`);
  }
  return `${column.meta.id} (${parts.join(", ")})`;
}

/** The columns that have data: defined for their k and with a series. */
function exported(columns: readonly CsvColumn[]): Array<CsvColumn & { series: CsvSeries }> {
  return columns.filter(
    (column): column is CsvColumn & { series: CsvSeries } =>
      column.supported && column.series !== null,
  );
}

function packageOf(series: CsvSeries, context: CsvContext): [string, string] {
  return [
    series.packageVersion ?? context.fallbackPackage?.version ?? "",
    series.packageRef ?? context.fallbackPackage?.ref ?? "",
  ];
}

/** Long format: one row per (round, series) the server has answered, round by round. */
export function longCsv(
  columns: readonly CsvColumn[],
  rounds: readonly number[],
  context: CsvContext,
): CsvTable {
  const sources = exported(columns).map((column) => ({
    column,
    params: paramsText(column),
    package: packageOf(column.series, context),
  }));
  const rows: string[][] = [];
  for (const round of rounds) {
    for (const { column, params, package: pkg } of sources) {
      const series = column.series;
      if (!series.answeredAt(round)) continue;
      const value = series.valueAt(round);
      rows.push([
        context.runId,
        context.networkId,
        String(round),
        column.meta.id,
        params,
        String(column.k),
        column.belief,
        value === null ? "" : csvNumber(value),
        series.levelAt(round) ?? "",
        ...pkg,
      ]);
    }
  }
  return { headers: [...LONG_HEADERS], rows };
}

/** The package of a wide file (constant columns): the first series that reported one. */
function widePackage(columns: ReadonlyArray<{ series: CsvSeries }>, context: CsvContext) {
  const version = columns.find((column) => column.series.packageVersion !== null)?.series;
  const ref = columns.find((column) => column.series.packageRef !== null)?.series;
  return [
    version?.packageVersion ?? context.fallbackPackage?.version ?? "",
    ref?.packageRef ?? context.fallbackPackage?.ref ?? "",
  ];
}

/**
 * Wide format: one row per listed round; per series its value column (its label) and, when it
 * has thresholds, a `<label> level` column; the package version and commit at the end. A round a
 * series has not answered yet, or answered without a value, is an empty cell.
 */
export function wideCsv(
  columns: readonly CsvColumn[],
  rounds: readonly number[],
  context: CsvContext,
): CsvTable {
  const sources = exported(columns).map((column) => ({
    column,
    levels: column.series.classification !== null,
  }));
  const headers = ["run_id", "network_id", "round"];
  for (const { column, levels } of sources) {
    headers.push(column.csvLabel);
    if (levels) headers.push(`${column.csvLabel} level`);
  }
  headers.push(...PACKAGE_HEADERS);
  const pkg = widePackage(
    sources.map((source) => source.column),
    context,
  );
  const rows = rounds.map((round) => {
    const row = [context.runId, context.networkId, String(round)];
    for (const { column, levels } of sources) {
      const value = column.series.valueAt(round);
      row.push(value === null ? "" : csvNumber(value));
      if (levels) row.push(column.series.levelAt(round) ?? "");
    }
    row.push(...pkg);
    return row;
  });
  return { headers, rows };
}

export function polarizationCsv(
  format: CsvFormat,
  columns: readonly CsvColumn[],
  rounds: readonly number[],
  context: CsvContext,
): CsvTable {
  return format === "long" ? longCsv(columns, rounds, context) : wideCsv(columns, rounds, context);
}

/** Characters kept in a file name token (anything else becomes `_`). */
const UNSAFE = /[^A-Za-z0-9_-]/g;
/** Characters of the network id kept in the file name. */
export const NETWORK_ID_CHARS = 8;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local time as YYYYMMDD-HHmm. */
export function fileStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/**
 * `polarization-<mode>-<long|wide>-run<runId>-net<networkId short>-<YYYYMMDD-HHmm>.csv`, mode
 * `series` or `all-measures`.
 */
export function polarizationCsvFileName({
  mode,
  format,
  runId,
  networkId,
  date,
}: {
  mode: "series" | "all";
  format: CsvFormat;
  runId: string;
  networkId: string;
  date: Date;
}): string {
  const run = runId.replace(UNSAFE, "_") || "unknown";
  const network = networkId.replace(UNSAFE, "_").slice(0, NETWORK_ID_CHARS) || "unknown";
  const modeToken = mode === "all" ? "all-measures" : "series";
  return `polarization-${modeToken}-${format}-run${run}-net${network}-${fileStamp(date)}.csv`;
}
