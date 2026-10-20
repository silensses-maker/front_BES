import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLastRunStore, useLaunchedConfigStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";
import { buildRunEnvelope, downloadEnvelopeJson } from "@/shared/lib/simulation-export";

const PAGE_LIMIT = 20;

export type HistoryStatusFilter = "all" | RunSummary["status"];

export type HistoryStatusCounts = Record<HistoryStatusFilter, number>;

export type HistoryTypeFilter = "all" | RunSummary["type"];

/** Local midnight that starts the calendar day `YYYY-MM-DD` (+ `dayOffset` days), or null. */
function localDayStart(day: string, dayOffset = 0): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayOffset).getTime();
}

/**
 * True when the ISO timestamp `createdAt` falls on a local calendar day within `[from, to]`
 * (`YYYY-MM-DD`, what a date input yields; both inclusive). An empty or malformed bound is open.
 */
export function isWithinDateRange(createdAt: string, from: string, to: string): boolean {
  const start = localDayStart(from);
  const end = localDayStart(to, 1);
  if (start === null && end === null) return true;
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return false;
  return (start === null || time >= start) && (end === null || time < end);
}

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
  /** Run type filter (#127); like the others, applied to the runs already loaded. */
  typeFilter: HistoryTypeFilter;
  setTypeFilter: (filter: HistoryTypeFilter) => void;
  /** Creation date range, `YYYY-MM-DD` or "" (open bound), inclusive (#127). */
  dateFrom: string;
  setDateFrom: (day: string) => void;
  dateTo: string;
  setDateTo: (day: string) => void;
  /** Resets the type and date-range filters (status and search keep their own controls). */
  clearTypeAndDateFilters: () => void;
  /** Run whose launch configuration this browser kept, i.e. the one that can be exported. */
  exportableRunId: string | null;
  /** Downloads that run's configuration with its runId and seed (#127). */
  exportRunConfig: (run: RunSummary) => void;
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
  const [typeFilter, setTypeFilter] = useState<HistoryTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const exportableRunId = useLaunchedConfigStore((s) => s.runId);

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
      if (typeFilter !== "all" && run.type !== typeFilter) return false;
      if (!isWithinDateRange(run.createdAt, dateFrom, dateTo)) return false;
      if (query === "") return true;
      const name = (run.name ?? "").toLowerCase();
      return name.includes(query) || run.id.toLowerCase().includes(query);
    });
  }, [runs, statusFilter, typeFilter, dateFrom, dateTo, searchQuery]);

  const clearTypeAndDateFilters = useCallback(() => {
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const exportRunConfig = useCallback(
    (run: RunSummary) => {
      const { runId, config } = useLaunchedConfigStore.getState();
      if (runId !== run.id || config === null) return;
      try {
        const envelope = buildRunEnvelope(config, { runId: run.id, seed: run.seed });
        const networkType = typeof config.networkType === "string" ? config.networkType : run.type;
        const file = downloadEnvelopeJson(envelope, networkType);
        toast.success(t("simulationHistory.exportConfigSuccess", { file }));
      } catch (error) {
        logger.error("useSimulationHistory.exportRunConfig", error);
        toast.error(t("simulationHistory.errorExportConfig"));
      }
    },
    [t],
  );

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

  /** Re-reads one run's status in place (and in the last-run chip) after a 409 on cancel. */
  const refreshRunStatus = useCallback(async (id: string): Promise<void> => {
    try {
      const fresh = await simulationsApi.getById(id);
      setRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, status: fresh.status } : run)),
      );
      const lastRun = useLastRunStore.getState();
      if (lastRun.runId === id) lastRun.setStatus(fresh.status);
    } catch (error) {
      logger.error("useSimulationHistory.refreshRunStatus", error);
    }
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
      if (isErrorCode(error, "conflict")) {
        // 409 (#124): the run finished before the cancel landed and keeps its terminal
        // status — show it instead of a failure.
        toast.info(t("simulationHistory.cancelAlreadyFinished"));
        await refreshRunStatus(id);
      } else {
        toast.error(t("simulationHistory.errorCancel"));
      }
    }
  }, [pendingCancelId, refreshRunStatus, t]);

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
    typeFilter,
    setTypeFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    clearTypeAndDateFilters,
    exportableRunId,
    exportRunConfig,
    pendingCancelRun,
    requestCancel,
    dismissCancel,
    confirmCancel,
    loadInitial,
    loadMore,
    selectRun,
  };
}
