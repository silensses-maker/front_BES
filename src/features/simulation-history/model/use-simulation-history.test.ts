import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { useSimulationHistory } from "./use-simulation-history";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Real last-run store (imported by file path to avoid the entity index pulling
// the WS client → backend API → Firebase chain into the test environment).
vi.mock("@/entities/simulation", async () => {
  const { useLastRunStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/last-run.store")
  >("@/entities/simulation/model/last-run.store");
  return { useLastRunStore };
});

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    listMine: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: vi.fn(),
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeRun = (id: string, overrides: Partial<RunSummary> = {}): RunSummary => ({
  id,
  type: "generated",
  name: null,
  status: "completed",
  networkCount: 1,
  iterationLimit: 100,
  stopThreshold: 0.01,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const run1 = makeRun("run-1");
const run2 = makeRun("run-2");

function setupMocks() {
  vi.mocked(useTranslation).mockReturnValue({
    t: (key: string) => key,
  } as unknown as ReturnType<typeof useTranslation>);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with an empty runs array", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.runs).toEqual([]);
    });

    it("starts with loading false", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.loading).toBe(false);
    });

    it("starts with hasMore false", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.hasMore).toBe(false);
    });

    it("starts with selectedRunId null", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.selectedRunId).toBeNull();
    });

    it("starts with selectedRun null", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.selectedRun).toBeNull();
    });
  });

  // ── loadInitial ───────────────────────────────────────────────────────────

  describe("loadInitial", () => {
    it("calls listMine with limit 20 and offset 0", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(simulationsApi.listMine).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });

    it("sets runs from the API response", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(result.current.runs).toEqual([run1, run2]);
    });

    it("sets hasMore to true when the page is full (length === 20)", async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => makeRun(`run-${i}`));
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: fullPage,
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(result.current.hasMore).toBe(true);
    });

    it("sets hasMore to false when fewer than 20 results are returned", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(result.current.hasMore).toBe(false);
    });

    it("sets loading to false in the finally block after success", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(result.current.loading).toBe(false);
    });

    it("logs the error and calls toast.error on failure", async () => {
      const error = new Error("network fail");
      vi.mocked(simulationsApi.listMine).mockRejectedValue(error);
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(logger.error).toHaveBeenCalledWith("useSimulationHistory.loadInitial", error);
      expect(toast.error).toHaveBeenCalledWith("simulationHistory.errorLoad");
    });

    it("sets loading to false in the finally block after error", async () => {
      vi.mocked(simulationsApi.listMine).mockRejectedValue(new Error("fail"));
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      expect(result.current.loading).toBe(false);
    });
  });

  // ── loadMore ──────────────────────────────────────────────────────────────

  describe("loadMore", () => {
    it("does not call the API when hasMore is false", async () => {
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadMore();
      });

      expect(simulationsApi.listMine).not.toHaveBeenCalled();
    });

    it("does not call the API when loading is true", async () => {
      // Trigger a slow loadInitial to capture the loading=true state
      let resolveInitial!: (val: { runs: RunSummary[]; limit: number; offset: number }) => void;
      vi.mocked(simulationsApi.listMine).mockReturnValueOnce(
        new Promise((res) => {
          resolveInitial = res;
        }),
      );

      const { result } = renderHook(() => useSimulationHistory());

      // Start loadInitial but don't await — hook is now loading=true
      act(() => {
        void result.current.loadInitial();
      });

      // Try loadMore while loading is true
      await act(async () => {
        await result.current.loadMore();
      });

      // Only one listMine call (the initial one, which is still pending)
      expect(simulationsApi.listMine).toHaveBeenCalledTimes(1);

      // Resolve so the hook can finish cleanly
      await act(async () => {
        resolveInitial({ runs: [], limit: 20, offset: 0 });
      });
    });

    it("appends new runs to the existing list after success", async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => makeRun(`run-page1-${i}`));
      vi.mocked(simulationsApi.listMine)
        .mockResolvedValueOnce({ runs: fullPage, limit: 20, offset: 0 })
        .mockResolvedValueOnce({ runs: [run1, run2], limit: 20, offset: 20 });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.runs).toHaveLength(22);
      expect(result.current.runs[20]).toEqual(run1);
    });

    it("calls listMine with the advanced offset on the second page", async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => makeRun(`run-page1-${i}`));
      vi.mocked(simulationsApi.listMine)
        .mockResolvedValueOnce({ runs: fullPage, limit: 20, offset: 0 })
        .mockResolvedValueOnce({ runs: [run1], limit: 20, offset: 20 });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(simulationsApi.listMine).toHaveBeenNthCalledWith(2, { limit: 20, offset: 20 });
    });

    it("sets hasMore false when the second page has fewer than 20 results", async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => makeRun(`run-p1-${i}`));
      vi.mocked(simulationsApi.listMine)
        .mockResolvedValueOnce({ runs: fullPage, limit: 20, offset: 0 })
        .mockResolvedValueOnce({ runs: [run1], limit: 20, offset: 20 });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.hasMore).toBe(false);
    });

    it("logs the error and calls toast.error on failure", async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => makeRun(`run-p1-${i}`));
      const error = new Error("load more fail");
      vi.mocked(simulationsApi.listMine)
        .mockResolvedValueOnce({ runs: fullPage, limit: 20, offset: 0 })
        .mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(logger.error).toHaveBeenCalledWith("useSimulationHistory.loadMore", error);
      expect(toast.error).toHaveBeenCalledWith("simulationHistory.errorLoad");
    });
  });

  // ── selectRun ─────────────────────────────────────────────────────────────

  describe("selectRun", () => {
    it("sets selectedRunId to the given id", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      act(() => {
        result.current.selectRun("run-1");
      });

      expect(result.current.selectedRunId).toBe("run-1");
    });

    it("toggles selectedRunId back to null when called with the same id", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      act(() => {
        result.current.selectRun("run-1");
      });
      act(() => {
        result.current.selectRun("run-1");
      });

      expect(result.current.selectedRunId).toBeNull();
    });

    it("selectedRun reflects the run matching selectedRunId", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      act(() => {
        result.current.selectRun("run-2");
      });

      expect(result.current.selectedRun).toEqual(run2);
    });

    it("selectedRun is null when no run matches selectedRunId", () => {
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.selectRun("nonexistent");
      });

      expect(result.current.selectedRun).toBeNull();
    });
  });

  // ── cancel flow ──────────────────────────────────────────────────────────

  describe("cancel flow", () => {
    async function loadRuns(result: { current: ReturnType<typeof useSimulationHistory> }) {
      await act(async () => {
        await result.current.loadInitial();
      });
    }

    const runningRun = makeRun("run-run", { status: "running" });

    it("requestCancel exposes the pending run; dismissCancel clears it", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [runningRun, run2],
        limit: 20,
        offset: 0,
      });
      const { result } = renderHook(() => useSimulationHistory());
      await loadRuns(result);

      act(() => {
        result.current.requestCancel("run-run");
      });
      expect(result.current.pendingCancelRun?.id).toBe("run-run");

      act(() => {
        result.current.dismissCancel();
      });
      expect(result.current.pendingCancelRun).toBeNull();
    });

    it("confirmCancel marks the run cancelled IN PLACE without removing it", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [runningRun, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockResolvedValue({ runId: "run-run", cancelled: true });
      const { result } = renderHook(() => useSimulationHistory());
      await loadRuns(result);

      act(() => {
        result.current.selectRun("run-run");
        result.current.requestCancel("run-run");
      });
      await act(async () => {
        await result.current.confirmCancel();
      });

      expect(simulationsApi.cancel).toHaveBeenCalledWith("run-run");
      expect(result.current.runs).toHaveLength(2);
      expect(result.current.runs.find((r) => r.id === "run-run")?.status).toBe("cancelled");
      // Selection is preserved — the row is still there
      expect(result.current.selectedRunId).toBe("run-run");
      expect(toast.success).toHaveBeenCalledWith("simulationHistory.cancelSuccess");
      expect(result.current.pendingCancelRun).toBeNull();
    });

    it("confirmCancel without a pending id is a no-op", async () => {
      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.confirmCancel();
      });

      expect(simulationsApi.cancel).not.toHaveBeenCalled();
    });

    it("keeps the run status untouched and toasts on API error", async () => {
      const error = new Error("cancel fail");
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [runningRun],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(error);
      const { result } = renderHook(() => useSimulationHistory());
      await loadRuns(result);

      act(() => {
        result.current.requestCancel("run-run");
      });
      await act(async () => {
        await result.current.confirmCancel();
      });

      expect(result.current.runs[0]?.status).toBe("running");
      expect(logger.error).toHaveBeenCalledWith("useSimulationHistory.confirmCancel", error);
      expect(toast.error).toHaveBeenCalledWith("simulationHistory.errorCancel");
    });
  });

  // ── filtering, search & counts ────────────────────────────────────────────

  describe("filtering, search and counts", () => {
    const sample = [
      makeRun("aaa-1", { name: "Polarización 180", status: "completed" }),
      makeRun("bbb-2", { name: "Barrido largo", status: "running" }),
      makeRun("ccc-3", { name: null, status: "error" }),
      makeRun("ddd-4", { name: "Umbral 0.6", status: "cancelled" }),
    ];

    async function loadSample(result: { current: ReturnType<typeof useSimulationHistory> }) {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: sample,
        limit: 20,
        offset: 0,
      });
      await act(async () => {
        await result.current.loadInitial();
      });
    }

    it("statusCounts tallies loaded runs per status", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      expect(result.current.statusCounts).toEqual({
        all: 4,
        running: 1,
        completed: 1,
        cancelled: 1,
        error: 1,
      });
    });

    it("statusFilter narrows filteredRuns", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setStatusFilter("cancelled");
      });

      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["ddd-4"]);
    });

    it("search matches name case-insensitively and is safe with null names", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setSearchQuery("polariza");
      });

      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["aaa-1"]);
    });

    it("search matches by id substring", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setSearchQuery("ccc");
      });

      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["ccc-3"]);
    });

    it("status filter and search compose", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setStatusFilter("running");
        result.current.setSearchQuery("barrido");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["bbb-2"]);

      act(() => {
        result.current.setSearchQuery("polariza");
      });
      expect(result.current.filteredRuns).toEqual([]);
    });
  });
});
