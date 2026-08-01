import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLastRunStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

const PAGE_LIMIT = 20;

export type HistoryStatusFilter = "all" | RunSummary["status"];

export type HistoryStatusCounts = Record<HistoryStatusFilter, number>;

export interface UseSimulationHistoryReturn {
  runs: RunSummary[];
  filteredRuns: RunSummary[];
  loading: boolean;
  hasMore: boolean;
  selectedRunId: string | null;
  selectedRun: RunSummary | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: HistoryStatusFilter;
  setStatusFilter: (filter: HistoryStatusFilter) => void;
  statusCounts: HistoryStatusCounts;
  pendingCancelRun: RunSummary | null;
  requestCancel: (id: string) => void;
  dismissCancel: () => void;
  confirmCancel: () => Promise<void>;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  selectRun: (id: string) => void;
}

/**
 * Experiment history state. All panel UI state (search, filter, pending
 * cancel) lives here — the panel component is fully controlled, so element
 * identity churn in the sidebar slot can never reset it.
 *
 * There is no delete: the backend's DELETE endpoint cancels a running
 * simulation, so the only destructive action is "cancel", offered for
 * `running` runs and reflected in-place as status "cancelled".
 */
export function useSimulationHistory(): UseSimulationHistoryReturn {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const pendingCancelRun = runs.find((r) => r.id === pendingCancelId) ?? null;

  const statusCounts = useMemo<HistoryStatusCounts>(() => {
    const counts: HistoryStatusCounts = {
      all: runs.length,
      running: 0,
      completed: 0,
      cancelled: 0,
      error: 0,
    };
    for (const run of runs) {
      counts[run.status] += 1;
    }
    return counts;
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return runs.filter((run) => {
      if (statusFilter !== "all" && run.status !== statusFilter) return false;
      if (query === "") return true;
      const name = (run.name ?? "").toLowerCase();
      return name.includes(query) || run.id.toLowerCase().includes(query);
    });
  }, [runs, statusFilter, searchQuery]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const response = await simulationsApi.listMine({ limit: PAGE_LIMIT, offset: 0 });
      setRuns(response.runs);
      setOffset(PAGE_LIMIT);
      setHasMore(response.runs.length === PAGE_LIMIT);
    } catch (error) {
      logger.error("useSimulationHistory.loadInitial", error);
      toast.error(t("simulationHistory.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const response = await simulationsApi.listMine({ limit: PAGE_LIMIT, offset });
      setRuns((prev) => [...prev, ...response.runs]);
      setOffset((prev) => prev + PAGE_LIMIT);
      setHasMore(response.runs.length === PAGE_LIMIT);
    } catch (error) {
      logger.error("useSimulationHistory.loadMore", error);
      toast.error(t("simulationHistory.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, offset, t]);

  const selectRun = useCallback((id: string) => {
    setSelectedRunId((prev) => (prev === id ? null : id));
  }, []);

  const requestCancel = useCallback((id: string) => {
    setPendingCancelId(id);
  }, []);

  const dismissCancel = useCallback(() => {
    setPendingCancelId(null);
  }, []);

  const confirmCancel = useCallback(async () => {
    const id = pendingCancelId;
    if (id === null) return;
    setPendingCancelId(null);
    try {
      await simulationsApi.cancel(id);
      // In-place status update — the run stays in the list as "cancelled"
      setRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, status: "cancelled" as const } : run)),
      );
      const lastRun = useLastRunStore.getState();
      if (lastRun.runId === id) lastRun.setStatus("cancelled");
      toast.success(t("simulationHistory.cancelSuccess"));
    } catch (error) {
      logger.error("useSimulationHistory.confirmCancel", error);
      toast.error(t("simulationHistory.errorCancel"));
    }
  }, [pendingCancelId, t]);

  return {
    runs,
    filteredRuns,
    loading,
    hasMore,
    selectedRunId,
    selectedRun,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    statusCounts,
    pendingCancelRun,
    requestCancel,
    dismissCancel,
    confirmCancel,
    loadInitial,
    loadMore,
    selectRun,
  };
}
