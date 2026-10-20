import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CONSENSUS_PURSUIT_TEMPLATE, RUN_SAVE_MODE } from "../lib/templates";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  NetworkType,
  WizardStep,
} from "../types/simulation-config.types";

export const DEFAULT_FORM: GeneratedSimFormValues = { ...CONSENSUS_PURSUIT_TEMPLATE };

export const DEFAULT_CUSTOM_FORM: CustomSimFormValues = {
  networkType: "custom",
  networkName: "",
  iterationLimit: 1000,
  stopThreshold: 0.001,
  saveMode: RUN_SAVE_MODE,
  agents: [],
  edges: [],
};

/** Where a draft pre-filled from the history came from (#127) — shown by the Review step. */
export interface RelaunchInfo {
  runId: string;
  /** The run's stored seed (decimal string), whether or not the wizard could hold it. */
  seed: string;
  seedKept: boolean;
  densityExact: boolean;
  /** Density the run used (stored). */
  effectiveDensity: number;
  /** Density the pre-filled value gives with the quotas at pre-fill time. */
  effectiveNow: number;
}

interface SimulationConfigState {
  networkType: NetworkType;
  step: WizardStep;
  generatedValues: GeneratedSimFormValues;
  customValues: CustomSimFormValues;
  activeTemplate: string | null;
  /** True when the current draft originated from an imported file (Review shows "Cargada desde archivo"). */
  loadedFromFile: boolean;
  /** Set when the draft was pre-filled from a past run ("Re-launch", #127); cleared like loadedFromFile. */
  relaunchedFrom: RelaunchInfo | null;
}

interface SimulationConfigActions {
  setNetworkType: (type: NetworkType) => void;
  setLoadedFromFile: (loaded: boolean) => void;
  setStep: (step: WizardStep) => void;
  updateGeneratedValues: (patch: Partial<GeneratedSimFormValues>) => void;
  updateCustomValues: (patch: Partial<CustomSimFormValues>) => void;
  setActiveTemplate: (key: string | null) => void;
  /** Replaces the generated draft with a past run's configuration and opens Review (#127). */
  applyRelaunch: (values: GeneratedSimFormValues, info: RelaunchInfo) => void;
  clearRelaunchedFrom: () => void;
  reset: () => void;
}

/**
 * Persisted-draft migration. v0 drafts may carry `majorityThreshold` /
 * `confidence` on generated agent-type rows (removed in #120: the simulator
 * fixes those values). They are dropped here so they never come back via
 * "Export JSON"; everything else is kept as-is. Never throws.
 */
export function migrateSimulationConfigDraft(persisted: unknown, version: number): unknown {
  if (version >= 1 || persisted === null || typeof persisted !== "object") return persisted;
  const state = persisted as { generatedValues?: { agentTypes?: unknown } };
  const agentTypes = state.generatedValues?.agentTypes;
  if (!Array.isArray(agentTypes)) return persisted;
  return {
    ...state,
    generatedValues: {
      ...state.generatedValues,
      agentTypes: agentTypes.map((row: unknown) => {
        if (row === null || typeof row !== "object") return row;
        const {
          majorityThreshold: _threshold,
          confidence: _confidence,
          ...rest
        } = row as Record<string, unknown>;
        return rest;
      }),
    },
  };
}

const initialState: SimulationConfigState = {
  networkType: "generated",
  step: "network",
  generatedValues: DEFAULT_FORM,
  customValues: DEFAULT_CUSTOM_FORM,
  activeTemplate: null,
  loadedFromFile: false,
  relaunchedFrom: null,
};

export const useSimulationConfigStore = create<SimulationConfigState & SimulationConfigActions>()(
  persist(
    (set) => ({
      ...initialState,

      setNetworkType: (type) =>
        set({
          networkType: type,
          step: type === "load" ? "load" : "network",
          loadedFromFile: false,
          relaunchedFrom: null,
        }),

      setLoadedFromFile: (loaded) => set({ loadedFromFile: loaded }),

      setStep: (step) => set({ step }),

      updateGeneratedValues: (patch) =>
        set((prev) => ({
          generatedValues: { ...prev.generatedValues, ...patch },
        })),

      updateCustomValues: (patch) =>
        set((prev) => ({
          customValues: { ...prev.customValues, ...patch } as CustomSimFormValues,
        })),

      setActiveTemplate: (key) => set({ activeTemplate: key }),

      applyRelaunch: (values, info) =>
        set({
          networkType: "generated",
          step: "review",
          generatedValues: values,
          activeTemplate: null,
          loadedFromFile: false,
          relaunchedFrom: info,
        }),

      clearRelaunchedFrom: () => set({ relaunchedFrom: null }),

      reset: () => set(initialState),
    }),
    {
      name: "bes-simulation-config",
      // v1 (#120): agent-type rows lost majorityThreshold / confidence.
      version: 1,
      migrate: (persisted, version) =>
        migrateSimulationConfigDraft(persisted, version) as SimulationConfigState &
          SimulationConfigActions,
    },
  ),
);
