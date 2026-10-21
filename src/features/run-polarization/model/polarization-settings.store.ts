import { create } from "zustand";
import type { PolarizationMeasureInfo, PolarizationParamValue } from "@/shared/api/backend";
import {
  type BeliefKind,
  type CategoryCount,
  DEFAULT_CATEGORY_COUNT,
} from "@/shared/lib/polarization";

/** Measure shown first, when the server's catalog has it (otherwise its first measure). */
export const DEFAULT_MEASURE = "EstebanRay";

export type ParamValues = Record<string, PolarizationParamValue>;

/**
 * Polarization view settings (#129): selected measure (a catalog id), its edited parameters
 * (remembered per measure), number of categories k and belief type. Kept for the session so
 * switching tabs, rounds or networks does not lose them.
 */
interface PolarizationSettingsState {
  measureId: string;
  /** Edited parameters per measure (missing keys = the package's defaults). */
  paramsByMeasure: Partial<Record<string, ParamValues>>;
  k: CategoryCount;
  /** Private beliefs by default (the agents' actual opinions). */
  belief: BeliefKind;

  setMeasure: (id: string) => void;
  setParams: (id: string, params: ParamValues) => void;
  resetParams: (id: string) => void;
  setK: (k: CategoryCount) => void;
  setBelief: (belief: BeliefKind) => void;
}

export const usePolarizationSettingsStore = /* #__PURE__ */ create<PolarizationSettingsState>(
  (set) => ({
    measureId: DEFAULT_MEASURE,
    paramsByMeasure: {},
    k: DEFAULT_CATEGORY_COUNT,
    belief: "private",

    setMeasure: (measureId) => set({ measureId }),
    setParams: (id, params) =>
      set((state) => ({
        paramsByMeasure: {
          ...state.paramsByMeasure,
          [id]: { ...state.paramsByMeasure[id], ...params },
        },
      })),
    resetParams: (id) =>
      set((state) => {
        const { [id]: _removed, ...rest } = state.paramsByMeasure;
        return { paramsByMeasure: rest };
      }),
    setK: (k) => set({ k }),
    setBelief: (belief) => set({ belief }),
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
