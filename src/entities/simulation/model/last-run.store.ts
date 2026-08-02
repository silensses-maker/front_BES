import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LastRunStatus = "running" | "completed" | "cancelled" | "error";

interface LastRunState {
  runId: string | null;
  name: string | null;
  networkCount: number | null;
  status: LastRunStatus;
  /** Latest round seen. In-memory only — excluded from persistence because it
   *  updates per frame and would churn localStorage. Resets to 0 on reload. */
  round: number;
}

interface LastRunActions {
  startRun: (payload: { runId: string; name: string | null; networkCount: number | null }) => void;
  setStatus: (status: LastRunStatus) => void;
  setRound: (round: number) => void;
  /** Overwrites stale persisted data with fresh RunSummary fields. */
  reconcile: (payload: {
    name: string | null;
    status: LastRunStatus;
    networkCount: number;
  }) => void;
  clear: () => void;
}

const initialState: LastRunState = {
  runId: null,
  name: null,
  networkCount: null,
  status: "completed",
  round: 0,
};

/**
 * Tracks the active/most-recent simulation run across navigation and reloads.
 * Feeds the header run chip, the sidebar rail run dot, and the breadcrumb run
 * label. Written from layers above shared (simulation-config on launch, the WS
 * client on status/frame events, the history hook on cancel).
 */
export const useLastRunStore = create<LastRunState & LastRunActions>()(
  persist(
    (set) => ({
      ...initialState,

      startRun: ({ runId, name, networkCount }) =>
        set({ runId, name, networkCount, status: "running", round: 0 }),

      setStatus: (status) => set({ status }),

      setRound: (round) => set({ round }),

      reconcile: ({ name, status, networkCount }) => set({ name, status, networkCount }),

      clear: () => set(initialState),
    }),
    {
      name: "bes-last-run",
      partialize: (state) => ({
        runId: state.runId,
        name: state.name,
        networkCount: state.networkCount,
        status: state.status,
      }),
    },
  ),
);
