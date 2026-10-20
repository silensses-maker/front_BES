import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLaunchedConfigStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { downloadEnvelopeJson, type SimConfigEnvelope } from "@/shared/lib/simulation-export";
import { isWithinDateRange, useSimulationHistory } from "./use-simulation-history";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// Real last-run and launched-config stores (imported by file path to avoid the entity index
// pulling the WS client → backend API → Firebase chain into the test environment).
vi.mock("@/entities/simulation", async () => {
  const { useLastRunStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/last-run.store")
  >("@/entities/simulation/model/last-run.store");
  const { useLaunchedConfigStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/launched-config.store")
  >("@/entities/simulation/model/launched-config.store");
  return { useLastRunStore, useLaunchedConfigStore };
});

// Real envelope builder; only the browser download is stubbed.
vi.mock("@/shared/lib/simulation-export", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/simulation-export")>(
    "@/shared/lib/simulation-export",
  );
  return { ...actual, downloadEnvelopeJson: vi.fn() };
});

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    listMine: vi.fn(),
    cancel: vi.fn(),
    getById: vi.fn(),
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

    it("on 409 conflict shows the run's real terminal status instead of an error", async () => {
      // DELETE on a run that finished meanwhile: the backend keeps its terminal status (#124)
      const conflict = {
        isAxiosError: true,
        response: { status: 409, data: { error: "conflict", message: "Run already finished" } },
      };
      vi.mocked(simulationsApi.listMine).mockResolvedValue({
        runs: [runningRun],
        limit: 20,
        offset: 0,
      });
      vi.mocked(simulationsApi.cancel).mockRejectedValue(conflict);
      vi.mocked(simulationsApi.getById).mockResolvedValue({ ...runningRun, status: "completed" });
      const { result } = renderHook(() => useSimulationHistory());
      await loadRuns(result);

      act(() => {
        result.current.requestCancel("run-run");
      });
      await act(async () => {
        await result.current.confirmCancel();
      });

      expect(simulationsApi.getById).toHaveBeenCalledWith("run-run");
      expect(result.current.runs[0]?.status).toBe("completed");
      expect(toast.info).toHaveBeenCalledWith("simulationHistory.cancelAlreadyFinished");
      expect(toast.error).not.toHaveBeenCalled();
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

  // ── type and date-range filters (#127) ────────────────────────────────────

  describe("type and date-range filters", () => {
    /** ISO timestamp of a LOCAL date-time, so the day boundaries hold in any time zone. */
    const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

    const sample = [
      makeRun("gen-jan", { type: "generated", createdAt: at(2026, 1, 10) }),
      makeRun("cus-jan", { type: "custom", name: "Red", createdAt: at(2026, 1, 20, 23) }),
      makeRun("gen-feb", { type: "generated", status: "running", createdAt: at(2026, 2, 1, 0) }),
    ];

    async function loadSample(result: { current: ReturnType<typeof useSimulationHistory> }) {
      vi.mocked(simulationsApi.listMine).mockResolvedValue({ runs: sample, limit: 20, offset: 0 });
      await act(async () => {
        await result.current.loadInitial();
      });
    }

    it("start with every type and an open date range", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.typeFilter).toBe("all");
      expect(result.current.dateFrom).toBe("");
      expect(result.current.dateTo).toBe("");
    });

    it("typeFilter narrows filteredRuns", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setTypeFilter("custom");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["cus-jan"]);

      act(() => {
        result.current.setTypeFilter("generated");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["gen-jan", "gen-feb"]);
    });

    it("the date range is inclusive on both ends, by local calendar day", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setDateFrom("2026-01-20");
        result.current.setDateTo("2026-02-01");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["cus-jan", "gen-feb"]);

      act(() => {
        result.current.setDateFrom("");
        result.current.setDateTo("2026-01-20");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["gen-jan", "cus-jan"]);
    });

    it("type, date, status and search compose; counts stay over the loaded runs", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setTypeFilter("generated");
        result.current.setDateFrom("2026-01-15");
        result.current.setStatusFilter("running");
      });
      expect(result.current.filteredRuns.map((r) => r.id)).toEqual(["gen-feb"]);
      expect(result.current.statusCounts.all).toBe(3);

      act(() => {
        result.current.setSearchQuery("jan");
      });
      expect(result.current.filteredRuns).toEqual([]);
    });

    it("clearTypeAndDateFilters resets type and dates but not status or search", async () => {
      const { result } = renderHook(() => useSimulationHistory());
      await loadSample(result);

      act(() => {
        result.current.setTypeFilter("custom");
        result.current.setDateFrom("2026-01-01");
        result.current.setDateTo("2026-01-31");
        result.current.setStatusFilter("completed");
        result.current.setSearchQuery("red");
      });
      act(() => {
        result.current.clearTypeAndDateFilters();
      });

      expect(result.current.typeFilter).toBe("all");
      expect(result.current.dateFrom).toBe("");
      expect(result.current.dateTo).toBe("");
      expect(result.current.statusFilter).toBe("completed");
      expect(result.current.searchQuery).toBe("red");
    });
  });

  describe("isWithinDateRange", () => {
    const noon = new Date(2026, 4, 15, 12).toISOString();
    const lastMs = new Date(2026, 4, 15, 23, 59, 59, 999).toISOString();
    const nextDay = new Date(2026, 4, 16, 0).toISOString();

    it("is open when both bounds are empty", () => {
      expect(isWithinDateRange(noon, "", "")).toBe(true);
      expect(isWithinDateRange("not a date", "", "")).toBe(true);
    });

    it("includes the whole 'to' day and excludes the next one", () => {
      expect(isWithinDateRange(lastMs, "", "2026-05-15")).toBe(true);
      expect(isWithinDateRange(nextDay, "", "2026-05-15")).toBe(false);
    });

    it("includes the 'from' day from its local midnight", () => {
      expect(isWithinDateRange(new Date(2026, 4, 15, 0).toISOString(), "2026-05-15", "")).toBe(
        true,
      );
      expect(isWithinDateRange(lastMs, "2026-05-16", "")).toBe(false);
    });

    it("treats a malformed bound as open", () => {
      expect(isWithinDateRange(noon, "15/05/2026", "")).toBe(true);
      expect(isWithinDateRange(noon, "", "tomorrow")).toBe(true);
    });

    it("excludes an unparsable timestamp once a bound is set", () => {
      expect(isWithinDateRange("not a date", "2026-05-15", "")).toBe(false);
    });

    it("an inverted range matches nothing", () => {
      expect(isWithinDateRange(noon, "2026-05-16", "2026-05-14")).toBe(false);
    });
  });

  // ── export from the run detail (#127) ────────────────────────────────────

  describe("exportRunConfig", () => {
    const launched = {
      networkType: "generated",
      numberOfAgents: 10,
      seed: null,
    };

    beforeEach(() => {
      useLaunchedConfigStore.getState().clear();
    });

    function lastDownload(): [SimConfigEnvelope, string] {
      const calls = vi.mocked(downloadEnvelopeJson).mock.calls;
      const call = calls[calls.length - 1];
      if (call === undefined) throw new Error("downloadEnvelopeJson was not called");
      return call;
    }

    const lastEnvelope = (): SimConfigEnvelope => lastDownload()[0];

    it("exposes the run whose launch configuration was kept", () => {
      const { result } = renderHook(() => useSimulationHistory());
      expect(result.current.exportableRunId).toBeNull();

      act(() => {
        useLaunchedConfigStore.getState().record("run-1", launched);
      });
      expect(result.current.exportableRunId).toBe("run-1");
    });

    it("downloads the launched configuration with the runId and the seed", () => {
      useLaunchedConfigStore.getState().record("run-1", launched);
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-1", { seed: "9223372036854775807" }));
      });

      const envelope = lastEnvelope();
      expect(envelope.runId).toBe("run-1");
      expect(envelope.seed).toBe("9223372036854775807");
      // Beyond the wizard's range: the payload keeps the launched seed
      expect(envelope.payload).toEqual(launched);
      expect(lastDownload()[1]).toBe("generated");
      expect(toast.success).toHaveBeenCalledWith("simulationHistory.exportConfigSuccess");
    });

    it("writes a replayable seed into the payload (random-seed launch)", () => {
      useLaunchedConfigStore.getState().record("run-1", launched);
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-1", { seed: "4503599627370496" }));
      });

      expect(lastEnvelope().seed).toBe("4503599627370496");
      expect(lastEnvelope().payload).toEqual({ ...launched, seed: 4503599627370496 });
    });

    it("exports a custom run without seed", () => {
      const custom = { networkType: "custom", networkName: "Red", agents: [], edges: [] };
      useLaunchedConfigStore.getState().record("run-c", custom);
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-c", { type: "custom", seed: null }));
      });

      expect(lastEnvelope()).not.toHaveProperty("seed");
      expect(lastEnvelope().payload).toEqual(custom);
      expect(lastDownload()[1]).toBe("custom");
    });

    it("falls back to the run type when the kept configuration has no networkType", () => {
      useLaunchedConfigStore.getState().record("run-x", { numberOfAgents: 3 });
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-x", { type: "custom" }));
      });

      expect(lastDownload()[1]).toBe("custom");
    });

    it("does nothing for a run whose configuration was not kept", () => {
      useLaunchedConfigStore.getState().record("run-1", launched);
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-2"));
      });

      expect(downloadEnvelopeJson).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("logs and toasts when the download fails", () => {
      useLaunchedConfigStore.getState().record("run-1", launched);
      vi.mocked(downloadEnvelopeJson).mockImplementationOnce(() => {
        throw new Error("blocked");
      });
      const { result } = renderHook(() => useSimulationHistory());

      act(() => {
        result.current.exportRunConfig(makeRun("run-1", { seed: "1" }));
      });

      expect(logger.error).toHaveBeenCalledWith(
        "useSimulationHistory.exportRunConfig",
        expect.any(Error),
      );
      expect(toast.error).toHaveBeenCalledWith("simulationHistory.errorExportConfig");
    });
  });
});
