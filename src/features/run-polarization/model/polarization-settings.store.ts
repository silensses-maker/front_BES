import { create } from "zustand";
import type { PolarizationMeasureInfo } from "@/shared/api/backend";
import {
  type BeliefKind,
  type CategoryCount,
  DEFAULT_CATEGORY_COUNT,
} from "@/shared/lib/polarization";
import type { AxisMode } from "../lib/normalize";
import {
  addSeries,
  fromSingleSeries,
  type OverlayMeasure,
  type OverlayPlan,
  overlayAllMeasures,
  type ParamValues,
  removeSeries,
  restoreList,
  type SeriesListState,
  selectSeries,
  updateSeries,
  withoutParams,
  withParams,
} from "./series-list";

export type { AxisMode } from "../lib/normalize";
export type { ParamValues } from "./series-list";

/** The Polarization tab shows the chart or the table (same series, cache and scheduling). */
export type PolarizationView = "chart" | "table";
/**
 * What the table lists: the compared series (as the chart), or every catalog measure with its
 * default parameters for one k and belief type (requested only while this mode is shown).
 */
export type TableMode = "series" | "all";

/** Measure shown first, when the server's catalog has it (otherwise its first measure). */
export const DEFAULT_MEASURE = "EstebanRay";

/**
 * Polarization view settings (#129): the compared series (each with its measure, the parameters
 * edited per measure, k and belief type), the selected one, the y-axis mode, chart or table, and
 * the table's mode and "all measures" k / belief. Kept for the session so switching tabs, rounds
 * or networks does not lose them. The view starts with one series: the single-series defaults
 * (Esteban–Ray, k = 5, private beliefs) migrated to a list.
 */
interface PolarizationSettingsState extends SeriesListState, ViewSettings {
  /** Adds a copy of the selected series (at most MAX_SERIES) and selects it. */
  addSeries: () => void;
  /** Removes a series (never the last one). */
  removeSeries: (id: number) => void;
  /**
   * Replaces the series with every measure defined for the selected series' k (defaults, its k
   * and belief type; see `overlayAllMeasures`). Returns the plan and the list it replaced, for
   * the view's notice and its undo.
   */
  overlayAllMeasures: (measures: readonly OverlayMeasure[]) => OverlayResult;
  /** Puts back a list an overlay replaced (its undo). */
  restoreList: (previous: SeriesListState) => void;
  selectSeries: (id: number) => void;
  setMeasure: (id: number, measureId: string) => void;
  setParams: (id: number, measureId: string, params: ParamValues) => void;
  resetParams: (id: number, measureId: string) => void;
  setK: (id: number, k: CategoryCount) => void;
  setBelief: (id: number, belief: BeliefKind) => void;
  setAxisMode: (mode: AxisMode) => void;
  setView: (view: PolarizationView) => void;
  setTableMode: (mode: TableMode) => void;
  setAllMeasuresK: (k: CategoryCount) => void;
  setAllMeasuresBelief: (belief: BeliefKind) => void;
}

/** An overlay's plan, and the list it replaced (what its undo restores). */
export interface OverlayResult extends OverlayPlan {
  previous: SeriesListState;
}

/** The y axis, the view and the table's settings. */
export interface ViewSettings {
  axisMode: AxisMode;
  view: PolarizationView;
  tableMode: TableMode;
  /** k of the table's "all measures" (null = the selected series' k, until one is chosen). */
  allMeasuresK: CategoryCount | null;
  /** Belief type of the "all measures" (null = the selected series' one, until one is chosen). */
  allMeasuresBelief: BeliefKind | null;
}

/**
 * The initial settings: the single-series defaults as a one-series list, real values, the chart;
 * the table lists the series, and its "all measures" follow the selected series' k and belief.
 */
export function defaultSettings(): SeriesListState & ViewSettings {
  return {
    ...fromSingleSeries({
      measureId: DEFAULT_MEASURE,
      paramsByMeasure: {},
      k: DEFAULT_CATEGORY_COUNT,
      belief: "private",
    }),
    axisMode: "values",
    view: "chart",
    tableMode: "series",
    allMeasuresK: null,
    allMeasuresBelief: null,
  };
}

/** The list part of the settings. */
function listOf({ series, selectedId, nextId }: SeriesListState): SeriesListState {
  return { series, selectedId, nextId };
}

export const usePolarizationSettingsStore = /* #__PURE__ */ create<PolarizationSettingsState>(
  (set, get) => ({
    ...defaultSettings(),

    addSeries: () => set((state) => addSeries(state)),
    removeSeries: (id) => set((state) => removeSeries(state, id)),
    overlayAllMeasures: (measures) => {
      const previous = listOf(get());
      const plan = overlayAllMeasures(previous, measures);
      if (plan.state !== previous) set(plan.state);
      return { ...plan, previous };
    },
    restoreList: (previous) => set((state) => restoreList(state, previous)),
    selectSeries: (id) => set((state) => selectSeries(state, id)),
    setMeasure: (id, measureId) =>
      set((state) => updateSeries(state, id, (s) => ({ ...s, measureId }))),
    setParams: (id, measureId, params) =>
      set((state) => updateSeries(state, id, (s) => withParams(s, measureId, params))),
    resetParams: (id, measureId) =>
      set((state) => updateSeries(state, id, (s) => withoutParams(s, measureId))),
    setK: (id, k) => set((state) => updateSeries(state, id, (s) => ({ ...s, k }))),
    setBelief: (id, belief) => set((state) => updateSeries(state, id, (s) => ({ ...s, belief }))),
    setAxisMode: (axisMode) => set({ axisMode }),
    setView: (view) => set({ view }),
    setTableMode: (tableMode) => set({ tableMode }),
    setAllMeasuresK: (allMeasuresK) => set({ allMeasuresK }),
    setAllMeasuresBelief: (allMeasuresBelief) => set({ allMeasuresBelief }),
  }),
);

/** The selected measure of the catalog: the stored id, else DEFAULT_MEASURE, else the first. */
export function selectedMeasure(
  measures: readonly PolarizationMeasureInfo[],
  measureId: string,
): PolarizationMeasureInfo | null {
  return (
    measures.find((m) => m.id === measureId) ??
    measures.find((m) => m.id === DEFAULT_MEASURE) ??
    measures[0] ??
    null
  );
}

/**
 * The measure's effective parameters: the catalog's defaults (the package's) overridden by the
 * edited ones. Edited names the measure does not have are dropped.
 */
export function effectiveParams(
  measure: PolarizationMeasureInfo,
  paramsByMeasure: Partial<Record<string, ParamValues>>,
): ParamValues {
  const edited = paramsByMeasure[measure.id] ?? {};
  const out: ParamValues = {};
  for (const spec of measure.params) {
    out[spec.name] = spec.name in edited ? (edited[spec.name] ?? null) : spec.default;
  }
  return out;
}
