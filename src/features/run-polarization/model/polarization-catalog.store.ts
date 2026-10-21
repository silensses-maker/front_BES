import { create } from "zustand";
import { type PolarizationCatalog, simulationsApi } from "@/shared/api/backend";
import { type PolarizationErrorInfo, polarizationErrorOf } from "../lib/polarization-error";

/**
 * The server's pol_measures catalog (#129: `GET /simulations/polarization/measures`), fetched once
 * per session on first use and kept: the measures, their parameters, defaults and ranges, the k
 * each supports and the thresholds come from the package itself. A failed load stays failed until
 * `load()` is called again (the view's retry button).
 */
type CatalogStatus = "idle" | "loading" | "ready" | "error";

interface PolarizationCatalogState {
  status: CatalogStatus;
  catalog: PolarizationCatalog | null;
  error: PolarizationErrorInfo | null;
  /** Loads the catalog unless it is loaded or loading (a no-op then). */
  load: () => Promise<void>;
}

export const usePolarizationCatalogStore = /* #__PURE__ */ create<PolarizationCatalogState>(
  (set, get) => ({
    status: "idle",
    catalog: null,
    error: null,

    load: async () => {
      const { status } = get();
      if (status === "loading" || status === "ready") return;
      set({ status: "loading", error: null });
      try {
        const catalog = await simulationsApi.getPolarizationMeasures();
        set({ status: "ready", catalog, error: null });
      } catch (err) {
        set({ status: "error", error: polarizationErrorOf(err) });
      }
    },
  }),
);
