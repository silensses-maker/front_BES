import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import type { DashboardOutletContext } from "@/app/layouts/dashboard/dashboard-layout";
import { useSimulationStore } from "@/entities/simulation";
import { SimulationConfigWizard } from "@/features/simulation-config";
import {
  RunDetailCard,
  SimulationHistoryPanel,
  useSimulationHistory,
} from "@/features/simulation-history";
import { useTranslation } from "@/shared/i18n";

/**
 * BoardPage — smart connector for the /board route.
 *
 * This is the only component in this slice that reads Zustand stores and
 * instantiates feature hooks. UI components it renders are all dumb (props-only).
 *
 * Pattern:
 *  - Reads `activePanel` and `setSidebarContent` from DashboardOutletContext.
 *  - On each render, injects the correct sidebar content via `setSidebarContent`.
 *  - Main content area renders context-appropriate empty states or the run detail.
 */
export function BoardPage() {
  const { t } = useTranslation();

  const { activePanel, setSidebarContent } = useOutletContext<DashboardOutletContext>();

  const storeRunId = useSimulationStore((s) => s.runId);
  const storeStatus = useSimulationStore((s) => s.status);

  const {
    runs,
    loading,
    hasMore,
    selectedRunId,
    selectedRun: activeRun,
    loadInitial,
    loadMore,
    selectRun,
    deleteRun,
  } = useSimulationHistory();

  const statusMap = useMemo<Record<string, string>>(() => {
    if (!storeRunId || storeStatus === "idle") return {};
    return { [storeRunId]: storeStatus };
  }, [storeRunId, storeStatus]);

  // Load history when transitioning to "my-experiments" panel
  const prevPanel = useRef<string | null>(null);
  useEffect(() => {
    if (activePanel === "my-experiments" && prevPanel.current !== "my-experiments") {
      loadInitial();
    }
    prevPanel.current = activePanel;
  }, [activePanel, loadInitial]);

  const handleSelectRun = useCallback(
    (id: string) => {
      selectRun(id);
    },
    [selectRun],
  );

  const historyPanel = useMemo(
    () => (
      <SimulationHistoryPanel
        runs={runs}
        loading={loading}
        hasMore={hasMore}
        selectedRunId={selectedRunId}
        statusMap={statusMap}
        onSelectRun={handleSelectRun}
        onDeleteRun={deleteRun}
        onLoadMore={loadMore}
      />
    ),
    [runs, loading, hasMore, selectedRunId, statusMap, handleSelectRun, deleteRun, loadMore],
  );

  const sidebarContent = useMemo(() => {
    if (activePanel === "new-simulation") return <SimulationConfigWizard />;
    return historyPanel;
  }, [activePanel, historyPanel]);

  useEffect(() => {
    setSidebarContent(sidebarContent);
  }, [sidebarContent, setSidebarContent]);

  // ── Board panels ──────────────────────────────────────────────────────────
  if (activePanel === "new-simulation") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-sans text-base font-medium text-foreground">
          {t("board.emptyNewSimulation")}
        </p>
        <p className="font-sans text-sm text-muted-foreground">
          {t("board.emptyNewSimulationHint")}
        </p>
      </div>
    );
  }

  if (activeRun) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <RunDetailCard run={activeRun} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-base font-medium text-foreground">
        {t("board.emptyMyExperiments")}
      </p>
      <p className="font-sans text-sm text-muted-foreground">{t("board.emptyMyExperimentsHint")}</p>
    </div>
  );
}
