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
  toast: { error: vi.fn() },
}));

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

const makeRun = (id: string): RunSummary => ({
  id,
  type: "generated",
  name: null,
  status: "completed",
  networkCount: 1,
  iterationLimit: 100,
  stopThreshold: 0.01,
  createdAt: "2026-01-01T00:00:00Z",
});

const run1 = makeRun("run-1");
const run2 = makeRun("run-2");
const run3 = makeRun("run-3");

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

  // ── deleteRun ─────────────────────────────────────────────────────────────

  describe("deleteRun", () => {
    it("optimistically removes the run from the list before the API responds", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2, run3],
        limit: 20,
        offset: 0,
      });
      let resolveCancel!: (val: { runId: string; cancelled: boolean }) => void;
      vi.mocked(simulationsApi.cancel).mockReturnValue(
        new Promise((res) => {
          resolveCancel = res;
        }),
      );

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      // Start delete but don't await
      act(() => {
        void result.current.deleteRun("run-2");
      });

      // run-2 should already be gone optimistically
      expect(result.current.runs.find((r) => r.id === "run-2")).toBeUndefined();
      expect(result.current.runs).toHaveLength(2);

      // Resolve so cleanup can finish
      await act(async () => {
        resolveCancel({ runId: "run-2", cancelled: true });
      });
    });

    it("calls simulationsApi.cancel with the run id", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockResolvedValue({ runId: "run-1", cancelled: true });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.deleteRun("run-1");
      });

      expect(simulationsApi.cancel).toHaveBeenCalledWith("run-1");
    });

    it("clears selectedRunId when the deleted run was selected", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockResolvedValue({ runId: "run-1", cancelled: true });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      act(() => {
        result.current.selectRun("run-1");
      });

      expect(result.current.selectedRunId).toBe("run-1");

      await act(async () => {
        await result.current.deleteRun("run-1");
      });

      expect(result.current.selectedRunId).toBeNull();
    });

    it("does not clear selectedRunId when a different run is deleted", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockResolvedValue({ runId: "run-2", cancelled: true });

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      act(() => {
        result.current.selectRun("run-1");
      });

      await act(async () => {
        await result.current.deleteRun("run-2");
      });

      expect(result.current.selectedRunId).toBe("run-1");
    });

    it("restores the original runs snapshot on API error", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2, run3],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(new Error("cancel fail"));

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.deleteRun("run-2");
      });

      expect(result.current.runs).toEqual([run1, run2, run3]);
    });

    it("calls toast.error with simulationHistory.errorDelete on API error", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(new Error("cancel fail"));

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.deleteRun("run-1");
      });

      expect(toast.error).toHaveBeenCalledWith("simulationHistory.errorDelete");
    });

    it("logs the error with logger.error on API error", async () => {
      const error = new Error("cancel fail");
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1, run2],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(error);

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.deleteRun("run-1");
      });

      expect(logger.error).toHaveBeenCalledWith("useSimulationHistory.deleteRun", error);
    });

    it("sets loading to false in the finally block after error", async () => {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [run1],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() => useSimulationHistory());

      await act(async () => {
        await result.current.loadInitial();
      });

      await act(async () => {
        await result.current.deleteRun("run-1");
      });

      expect(result.current.loading).toBe(false);
    });
  });
});
