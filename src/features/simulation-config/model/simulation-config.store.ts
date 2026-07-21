import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CONSENSUS_PURSUIT_TEMPLATE } from "../lib/templates";
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
  saveMode: 1,
  agents: [],
  edges: [],
};

interface SimulationConfigState {
  networkType: NetworkType;
  step: WizardStep;
  generatedValues: GeneratedSimFormValues;
  customValues: CustomSimFormValues;
  activeTemplate: string | null;
}

interface SimulationConfigActions {
  setNetworkType: (type: NetworkType) => void;
  setStep: (step: WizardStep) => void;
  updateGeneratedValues: (patch: Partial<GeneratedSimFormValues>) => void;
  updateCustomValues: (patch: Partial<CustomSimFormValues>) => void;
  setActiveTemplate: (key: string | null) => void;
  reset: () => void;
}

const initialState: SimulationConfigState = {
  networkType: "generated",
  step: "network",
  generatedValues: DEFAULT_FORM,
  customValues: DEFAULT_CUSTOM_FORM,
  activeTemplate: null,
};

export const useSimulationConfigStore = create<SimulationConfigState & SimulationConfigActions>()(
  persist(
    (set) => ({
      ...initialState,

      setNetworkType: (type) =>
        set({
          networkType: type,
          step: type === "load" ? "load" : "network",
        }),

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

      reset: () => set(initialState),
    }),
    {
      name: "bes-simulation-config",
    },
  ),
);
