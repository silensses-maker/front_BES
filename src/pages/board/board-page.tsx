import { useEffect, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  SimulationConfigWizard,
  SimulationLiveSummary,
  useRelaunchRun,
} from "@/features/simulation-config";
import {
  RunDetailCard,
  SimulationHistoryPanel,
  useSimulationHistory,
} from "@/features/simulation-history";
import { useTranslation } from "@/shared/i18n";
import type { DashboardOutletContext } from "@/shared/types/dashboard";

/**
 * BoardPage — smart connector for the /board route.
 *
 * This is the only component in this slice that reads Zustand stores and
 * instantiates feature hooks. UI components it renders are all dumb (props-only).
 *
 * All history UI state (search, filter, pending cancel) lives inside
 * useSimulationHistory, so the memoized panel element below can churn identity
 * without losing anything.
 */
export function BoardPage() {
  const { t } = useTranslation();

  const { activePanel, setSidebarContent } = useOutletContext<DashboardOutletContext>();

  const {
    filteredRuns,
    loading,
    hasMore,
    selectedRunId,
    selectedRun: activeRun,
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
  } = useSimulationHistory();
  const { relaunch, relaunchingRunId } = useRelaunchRun();

  // Load history when transitioning to "my-experiments" panel
  const prevPanel = useRef<string | null>(null);
  useEffect(() => {
    if (activePanel === "my-experiments" && prevPanel.current !== "my-experiments") {
      void loadInitial();
    }
    prevPanel.current = activePanel;
  }, [activePanel, loadInitial]);

  const historyPanel = useMemo(
    () => (
      <SimulationHistoryPanel
        runs={filteredRuns}
        loading={loading}
        hasMore={hasMore}
        selectedRunId={selectedRunId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onClearTypeAndDateFilters={clearTypeAndDateFilters}
        pendingCancelRun={pendingCancelRun}
        onRequestCancel={requestCancel}
        onDismissCancel={dismissCancel}
        onConfirmCancel={confirmCancel}
        onSelectRun={selectRun}
        onLoadMore={loadMore}
      />
    ),
    [
      filteredRuns,
      loading,
      hasMore,
      selectedRunId,
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
      pendingCancelRun,
      requestCancel,
      dismissCancel,
      confirmCancel,
      selectRun,
      loadMore,
    ],
  );

  const sidebarContent = useMemo(() => {
    if (activePanel === "new-simulation") return <SimulationConfigWizard />;
    return historyPanel;
  }, [activePanel, historyPanel]);

  useEffect(() => {
    setSidebarContent(sidebarContent);
    // Cleanup on unmount — otherwise the history panel leaks into run routes
    // that inject nothing (e.g. the "gone" state)
    return () => setSidebarContent(null);
  }, [sidebarContent, setSidebarContent]);

  // ── Board panels ──────────────────────────────────────────────────────────
  if (activePanel === "new-simulation") {
    return (
      <div className="py-6">
        <SimulationLiveSummary />
      </div>
    );
  }

  if (activeRun) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <RunDetailCard
          run={activeRun}
          // Only the run whose launch configuration this browser kept can be exported (#127)
          onExportConfig={
            activeRun.id === exportableRunId ? () => exportRunConfig(activeRun) : undefined
          }
          // Generated runs only: rebuilt from the stored configuration (#127)
          onRelaunch={
            activeRun.type === "generated" ? () => void relaunch(activeRun.id) : undefined
          }
          relaunching={relaunchingRunId === activeRun.id}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      {/* Mockup empty-state glyph: dashed circle with ◌ */}
      <div
        aria-hidden="true"
        className="mb-2 flex size-12 items-center justify-center rounded-full border border-dashed border-muted-foreground text-lg text-muted-foreground"
      >
        ◌
      </div>
      <p className="font-sans text-base font-semibold text-foreground">
        {t("board.emptyMyExperiments")}
      </p>
      <p className="font-sans text-sm text-muted-foreground">{t("board.emptyMyExperimentsHint")}</p>
    </div>
  );
}
