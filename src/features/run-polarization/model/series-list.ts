import type { PolarizationParamValue } from "@/shared/api/backend";
import type { BeliefKind, CategoryCount } from "@/shared/lib/polarization";

/**
 * Polarization comparison (#129): the list of series the chart overlays, each configured on its
 * own (measure, its parameters, k and belief type). Pure functions over an immutable state; the
 * settings store (polarization-settings.store.ts) wraps them.
 */

export type ParamValues = Record<string, PolarizationParamValue>;

/** At most this many series on the chart. */
export const MAX_SERIES = 4;

export interface SeriesConfig {
  /** Stable identity (React key, selection, debounce), never reused within a session. */
  id: number;
  /**
   * Colour slot (index of `ChartTheme.series`), kept while the series exists so removing another
   * series does not repaint it. A series left alone takes slot 0 (the single-series colour).
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
