import { useCallback, useState } from "react";
import { toast } from "sonner";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";

import { logger } from "@/shared/lib/logger";

const PAGE_LIMIT = 20;

export interface UseSimulationHistoryReturn {
  runs: RunSummary[];
  loading: boolean;
  hasMore: boolean;
  selectedRunId: string | null;
  selectedRun: RunSummary | null;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  selectRun: (id: string) => void;
  deleteRun: (id: string) => Promise<void>;
}

export function useSimulationHistory(): UseSimulationHistoryReturn {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

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

  const deleteRun = useCallback(
    async (id: string) => {
      const snapshot = runs;
      setRuns((prev) => prev.filter((r) => r.id !== id));
      if (selectedRunId === id) setSelectedRunId(null);

      setLoading(true);
      try {
        await simulationsApi.cancel(id);
      } catch (error) {
        logger.error("useSimulationHistory.deleteRun", error);
        setRuns(snapshot);
        toast.error(t("simulationHistory.errorDelete"));
      } finally {
        setLoading(false);
      }
    },
    [runs, selectedRunId, t],
  );

  return {
    runs,
    loading,
    hasMore,
    selectedRunId,
    selectedRun,
    loadInitial,
    loadMore,
    selectRun,
    deleteRun,
  };
}
