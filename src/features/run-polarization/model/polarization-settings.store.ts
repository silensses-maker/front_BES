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
  type ParamValues,
  removeSeries,
  type SeriesListState,
  selectSeries,
  updateSeries,
  withoutParams,
  withParams,
} from "./series-list";

export type { AxisMode } from "../lib/normalize";
export type { ParamValues } from "./series-list";

/** Measure shown first, when the server's catalog has it (otherwise its first measure). */
export const DEFAULT_MEASURE = "EstebanRay";

/**
 * Polarization view settings (#129): the compared series (each with its measure, the parameters
 * edited per measure, k and belief type), the selected one and the y-axis mode. Kept for the
 * session so switching tabs, rounds or networks does not lose them. The view starts with one
 * series: the single-series defaults (Esteban–Ray, k = 5, private beliefs) migrated to a list.
 */
interface PolarizationSettingsState extends SeriesListState {
  axisMode: AxisMode;

  /** Adds a copy of the selected series (at most MAX_SERIES) and selects it. */
  addSeries: () => void;
  /** Removes a series (never the last one). */
  removeSeries: (id: number) => void;
  selectSeries: (id: number) => void;
  setMeasure: (id: number, measureId: string) => void;
  setParams: (id: number, measureId: string, params: ParamValues) => void;
  resetParams: (id: number, measureId: string) => void;
  setK: (id: number, k: CategoryCount) => void;
  setBelief: (id: number, belief: BeliefKind) => void;
  setAxisMode: (mode: AxisMode) => void;
}

/** The initial settings: the single-series defaults as a one-series list, real values. */
export function defaultSettings(): SeriesListState & { axisMode: AxisMode } {
  return {
    ...fromSingleSeries({
      measureId: DEFAULT_MEASURE,
      paramsByMeasure: {},
      k: DEFAULT_CATEGORY_COUNT,
      belief: "private",
    }),
    axisMode: "values",
  };
}

export const usePolarizationSettingsStore = /* #__PURE__ */ create<PolarizationSettingsState>(
  (set) => ({
    ...defaultSettings(),

    addSeries: () => set((state) => addSeries(state)),
    removeSeries: (id) => set((state) => removeSeries(state, id)),
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
