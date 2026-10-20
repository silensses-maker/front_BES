import { create } from "zustand";
import { persist } from "zustand/middleware";
import { logger } from "@/shared/lib/logger";

interface LaunchedConfigState {
  /** Run the configuration below was launched as; null before the first launch. */
  runId: string | null;
  /**
   * Wizard values the run was launched with (the same object "Export JSON" writes as `payload`).
   * Domain-free here: the simulation-config feature owns its shape.
   */
  config: Record<string, unknown> | null;
}

interface LaunchedConfigActions {
  /** Called once per successful launch; replaces the previous run's configuration. */
  record: (runId: string, config: Record<string, unknown>) => void;
  clear: () => void;
}

const initialState: LaunchedConfigState = { runId: null, config: null };

/**
 * Configuration of the most recent run launched from this browser (#127), so its run detail can
 * export it with its runId and seed after the wizard draft has been reset. Only that one
 * run: the backend does not return the configuration of past runs.
 *
 * It has its own storage key, written once per launch — not the last-run store, which is written
 * on every received round. A configuration too large for localStorage stays in memory only (the
 * export then lasts until the next reload); the launch itself never fails because of it.
 */
export const useLaunchedConfigStore = create<LaunchedConfigState & LaunchedConfigActions>()(
  persist(
    (set) => ({
      ...initialState,

      record: (runId, config) => {
        try {
          set({ runId, config });
        } catch (error) {
          // The state is already set in memory; only persisting it failed (e.g. QuotaExceededError).
          logger.error("launchedConfig.record", error);
        }
      },

      clear: () => set(initialState),
    }),
    { name: "bes-launched-config" },
  ),
);
