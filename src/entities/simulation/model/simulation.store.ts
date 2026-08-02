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
  ingestLiveFrame: (frame: MergedFrame) => void;
  setFollow: (follow: boolean) => void;
  setFinalRound: (round: number) => void;
  setConsensus: (consensus: boolean) => void;
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
  receivedFrame: null,
  receivedRound: 0,
  follow: true,
  finalRound: null,
  consensus: null,
  error: null,
  selectedAgentIndex: null,
};

export const useSimulationStore = create<SimulationState & SimulationActions>((set) => ({
  ...initialState,

  setRunId: (runId) => set({ runId }),

  setStatus: (status) => set({ status }),

  setNetworkId: (networkId) => set({ networkId }),

  setTopology: (topology) => set({ topology }),

  // Renders a frame on screen (viewed round) without touching the live cursor —
  // used by the playback engine for seeks and replay.
  updateFrame: (frame) => set({ currentRound: frame.round, latestFrame: frame }),

  // Live-stream ingestion: always advances the "recibidas" cursor; only renders
  // the frame when the viewer is following the live tail. Detached reviewers
  // keep their viewed round while data keeps arriving.
  ingestLiveFrame: (frame) =>
    set((state) => ({
      receivedFrame: frame,
      receivedRound: Math.max(state.receivedRound, frame.round),
      ...(state.follow && { currentRound: frame.round, latestFrame: frame }),
    })),

  setFollow: (follow) => set({ follow }),

  setFinalRound: (round) => set({ finalRound: round }),

  setConsensus: (consensus) => set({ consensus }),

  setError: (error) => set({ status: "error", error }),

  setSelectedAgentIndex: (index) => set({ selectedAgentIndex: index }),

  reset: () => set(initialState),
}));
