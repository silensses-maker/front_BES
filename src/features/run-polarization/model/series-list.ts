import type { PolarizationParamValue } from "@/shared/api/backend";
import type { BeliefKind, CategoryCount } from "@/shared/lib/polarization";

/**
 * Polarization comparison (#129): the list of series the chart overlays, each configured on its
 * own (measure, its parameters, k and belief type). Pure functions over an immutable state; the
 * settings store (polarization-settings.store.ts) wraps them.
 */

export type ParamValues = Record<string, PolarizationParamValue>;

/**
 * At most this many series on the chart: the number of measures pol_measures has, so every
 * measure can be overlaid at once. Their slots map to 4 colours × solid / dashed / dotted
 * (lib/series-style.ts).
 */
export const MAX_SERIES = 10;

export interface SeriesConfig {
  /** Stable identity (React key, selection, debounce), never reused within a session. */
  id: number;
  /**
   * Style slot, 0 to MAX_SERIES − 1: its colour (`ChartTheme.series`) and line style (solid,
   * dashed, dotted; see lib/series-style.ts). Kept while the series exists so removing another
   * series does not restyle it. A series left alone takes slot 0 (the single-series style).
   */
  slot: number;
  measureId: string;
  /** Edited parameters per measure (missing keys = the package's defaults). */
  paramsByMeasure: Partial<Record<string, ParamValues>>;
  k: CategoryCount;
  belief: BeliefKind;
}

export interface SeriesListState {
  /** In chip order; never empty. */
  series: SeriesConfig[];
  /** The series whose configuration the controls show; `+` clones it. */
  selectedId: number;
  nextId: number;
}

/** The single-series settings the view had before the comparison (one measure, k, belief). */
export interface SingleSeriesSettings {
  measureId: string;
  paramsByMeasure: Partial<Record<string, ParamValues>>;
  k: CategoryCount;
  belief: BeliefKind;
}

/** Migration: single-series settings become a one-series list (slot 0, selected). */
export function fromSingleSeries(single: SingleSeriesSettings): SeriesListState {
  return {
    series: [
      {
        id: 1,
        slot: 0,
        measureId: single.measureId,
        paramsByMeasure: single.paramsByMeasure,
        k: single.k,
        belief: single.belief,
      },
    ],
    selectedId: 1,
    nextId: 2,
  };
}

/** The selected series (the first one if the id is unknown). */
export function selectedSeries(state: SeriesListState): SeriesConfig {
  return (state.series.find((s) => s.id === state.selectedId) ?? state.series[0]) as SeriesConfig;
}

function freeSlot(series: readonly SeriesConfig[]): number {
  for (let slot = 0; slot < MAX_SERIES; slot++) {
    if (!series.some((s) => s.slot === slot)) return slot;
  }
  return series.length % MAX_SERIES;
}

/**
 * Adds a copy of the selected series (so one setting can be changed and compared), right after
 * it, and selects the copy. A no-op at MAX_SERIES.
 */
export function addSeries(state: SeriesListState): SeriesListState {
  if (state.series.length >= MAX_SERIES) return state;
  const source = selectedSeries(state);
  const copy: SeriesConfig = {
    ...source,
    id: state.nextId,
    slot: freeSlot(state.series),
    paramsByMeasure: { ...source.paramsByMeasure },
  };
  const at = state.series.indexOf(source) + 1;
  return {
    series: [...state.series.slice(0, at), copy, ...state.series.slice(at)],
    selectedId: copy.id,
    nextId: state.nextId + 1,
  };
}

/**
 * Removes a series. The last one cannot be removed (a no-op). Removing the selected series
 * selects its neighbour (the next one, else the previous one); a series left alone takes slot 0.
 */
export function removeSeries(state: SeriesListState, id: number): SeriesListState {
  const index = state.series.findIndex((s) => s.id === id);
  if (index === -1 || state.series.length <= 1) return state;
  let series = state.series.filter((s) => s.id !== id);
  if (series.length === 1) series = series.map((s) => ({ ...s, slot: 0 }));
  const neighbour = series[Math.min(index, series.length - 1)] as SeriesConfig;
  return {
    series,
    selectedId: state.selectedId === id ? neighbour.id : state.selectedId,
    nextId: state.nextId,
  };
}

export function selectSeries(state: SeriesListState, id: number): SeriesListState {
  if (state.selectedId === id || !state.series.some((s) => s.id === id)) return state;
  return { ...state, selectedId: id };
}

/** Applies `update` to one series (unknown id: unchanged). */
export function updateSeries(
  state: SeriesListState,
  id: number,
  update: (series: SeriesConfig) => SeriesConfig,
): SeriesListState {
  if (!state.series.some((s) => s.id === id)) return state;
  return { ...state, series: state.series.map((s) => (s.id === id ? update(s) : s)) };
}

/** A series' parameters for `measureId` merged with `params`. */
export function withParams(
  series: SeriesConfig,
  measureId: string,
  params: ParamValues,
): SeriesConfig {
  return {
    ...series,
    paramsByMeasure: {
      ...series.paramsByMeasure,
      [measureId]: { ...series.paramsByMeasure[measureId], ...params },
    },
  };
}

/** A series with the package's defaults back for `measureId`. */
export function withoutParams(series: SeriesConfig, measureId: string): SeriesConfig {
  const { [measureId]: _removed, ...rest } = series.paramsByMeasure;
  return { ...series, paramsByMeasure: rest };
}

// ─── Overlay all measures ─────────────────────────────────────────────────────────────────────

/** What overlaying needs of a catalog measure. */
export interface OverlayMeasure {
  id: string;
  /** The k it is defined for. */
  categories: readonly number[];
}

export interface OverlayPlan {
  /** The new list (the same state when no measure is defined for k). */
  state: SeriesListState;
  /** Ids of the measures not defined for k, in catalog order. */
  skipped: string[];
  /** Ids of the measures defined for k left out by MAX_SERIES, in catalog order. */
  omitted: string[];
}

/**
 * "Overlay all measures": a list with one series per catalog measure defined for the selected
 * series' k, in catalog order and up to MAX_SERIES, each with the package's default parameters
 * and the selected series' k and belief type. It REPLACES the list (the view offers an undo,
 * see `restoreList`); slots follow the catalog order (0, 1, …), ids are new, and the series of
 * the selected series' measure stays selected (else the first). Equal specs reuse the cached
 * series, so a measure already shown with its defaults costs no request.
 */
export function overlayAllMeasures(
  state: SeriesListState,
  measures: readonly OverlayMeasure[],
): OverlayPlan {
  const source = selectedSeries(state);
  const defined = measures.filter((m) => m.categories.includes(source.k));
  const skipped = measures.filter((m) => !m.categories.includes(source.k)).map((m) => m.id);
  const kept = defined.slice(0, MAX_SERIES);
  const omitted = defined.slice(MAX_SERIES).map((m) => m.id);
  if (kept.length === 0) return { state, skipped, omitted };
  const series = kept.map(
    (measure, index): SeriesConfig => ({
      id: state.nextId + index,
      slot: kept.length === 1 ? 0 : index,
      measureId: measure.id,
      paramsByMeasure: {},
      k: source.k,
      belief: source.belief,
    }),
  );
  const selected = series.find((s) => s.measureId === source.measureId) ?? series[0];
  return {
    state: {
      series,
      selectedId: (selected as SeriesConfig).id,
      nextId: state.nextId + series.length,
    },
    skipped,
    omitted,
  };
}

/**
 * Undo of an overlay: the list as it was (`previous`). Ids stay never reused: the next id is the
 * highest one handed out so far.
 */
export function restoreList(current: SeriesListState, previous: SeriesListState): SeriesListState {
  return {
    series: previous.series,
    selectedId: previous.selectedId,
    nextId: Math.max(current.nextId, previous.nextId),
  };
}
