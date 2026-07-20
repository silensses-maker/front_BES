import { create } from "zustand";
import type { TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import type { SimulationState, SimulationStatus } from "../types/simulation.types";

interface SimulationActions {
  setRunId: (runId: string) => void;
  setStatus: (status: SimulationStatus) => void;
  setNetworkId: (networkId: string) => void;
  setTopology: (topology: TopologyResponse) => void;
  updateFrame: (frame: MergedFrame) => void;
  setFinalRound: (round: number) => void;
  setError: (error: string) => void;
  setSelectedAgentIndex: (index: number | null) => void;
  reset: () => void;
}

const initialState: SimulationState = {
  status: "idle",
  runId: null,
  networkId: null,
  topology: null,
  currentRound: 0,
  latestFrame: null,
  finalRound: null,
  error: null,
  selectedAgentIndex: null,
};

export const useSimulationStore = create<SimulationState & SimulationActions>((set) => ({
  ...initialState,

  setRunId: (runId) => set({ runId }),

  setStatus: (status) => set({ status }),

  setNetworkId: (networkId) => set({ networkId }),

  setTopology: (topology) => set({ topology }),

  updateFrame: (frame) => set({ currentRound: frame.round, latestFrame: frame }),

  setFinalRound: (round) => set({ finalRound: round }),

  setError: (error) => set({ status: "error", error }),

  setSelectedAgentIndex: (index) => set({ selectedAgentIndex: index }),

  reset: () => set(initialState),
}));
