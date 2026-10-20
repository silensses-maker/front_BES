import { create } from "zustand";
import {
  type BeliefKind,
  type CategoryCount,
  DEFAULT_CATEGORY_COUNT,
  DEFAULT_MEASURE,
  defaultParams,
  type MeasureId,
  type MeasureParams,
} from "@/shared/lib/polarization";

/**
 * Polarization view settings (#129): selected measure, its parameters (remembered per measure),
 * number of categories k and belief type. Kept for the session so switching tabs, rounds or
 * networks does not lose them.
 */
interface PolarizationSettingsState {
  measureId: MeasureId;
  /** Edited parameters per measure (missing keys = package defaults). */
  paramsByMeasure: Partial<Record<MeasureId, MeasureParams>>;
  k: CategoryCount;
  /** Private beliefs by default (the agents' actual opinions). */
  belief: BeliefKind;

  setMeasure: (id: MeasureId) => void;
  setParams: (id: MeasureId, params: MeasureParams) => void;
  resetParams: (id: MeasureId) => void;
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

/** The measure's effective parameters: package defaults overridden by the edited ones. */
export function effectiveParams(
  paramsByMeasure: Partial<Record<MeasureId, MeasureParams>>,
  id: MeasureId,
): MeasureParams {
  return { ...defaultParams(id), ...paramsByMeasure[id] };
}
