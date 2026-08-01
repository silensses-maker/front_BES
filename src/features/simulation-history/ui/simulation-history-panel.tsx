import { Search } from "lucide-react";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { SidebarShell } from "@/shared/ui/sidebar-shell";
import type { HistoryStatusCounts, HistoryStatusFilter } from "../model/use-simulation-history";

interface SimulationHistoryPanelProps {
  runs: RunSummary[];
  loading: boolean;
  hasMore: boolean;
  selectedRunId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: HistoryStatusFilter;
  onFilterChange: (filter: HistoryStatusFilter) => void;
  statusCounts: HistoryStatusCounts;
  pendingCancelRun: RunSummary | null;
  onRequestCancel: (id: string) => void;
  onDismissCancel: () => void;
  onConfirmCancel: () => void;
  onSelectRun: (id: string) => void;
  onLoadMore: () => void;
}

const STATUS_BADGE_VARIANT: Record<
  RunSummary["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  completed: "secondary",
  error: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL_KEY = {
  running: "simulationHistory.statusRunning",
  completed: "simulationHistory.statusCompleted",
  error: "simulationHistory.statusError",
  cancelled: "simulationHistory.statusCancelled",
} as const;

const FILTERS: Array<{ key: HistoryStatusFilter; labelKey: string }> = [
  { key: "all", labelKey: "simulationHistory.filterAll" },
  { key: "running", labelKey: "simulationHistory.filterRunning" },
  { key: "completed", labelKey: "simulationHistory.filterCompleted" },
  { key: "error", labelKey: "simulationHistory.filterError" },
  { key: "cancelled", labelKey: "simulationHistory.filterCancelled" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Experiment history list (dumb, fully controlled — all state lives in
 * useSimulationHistory). The only destructive action is cancelling a RUNNING
 * run, confirmed through a Dialog; there is no delete (the backend endpoint
 * cancels, finished runs stay in the history).
 */
export function SimulationHistoryPanel({
  runs,
  loading,
  hasMore,
  selectedRunId,
  searchQuery,
  onSearchChange,
  statusFilter,
  onFilterChange,
  statusCounts,
  pendingCancelRun,
  onRequestCancel,
  onDismissCancel,
  onConfirmCancel,
  onSelectRun,
  onLoadMore,
}: SimulationHistoryPanelProps) {
  const { t } = useTranslation();

  const header = (
    <div className="flex flex-col gap-2 px-3 pb-2 pt-1">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("simulationHistory.searchPlaceholder")}
          aria-label={t("simulationHistory.searchPlaceholder")}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-sans text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              statusFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(labelKey as Parameters<typeof t>[0])} · {statusCounts[key]}
          </button>
        ))}
      </div>
      <p className="font-sans text-xs text-muted-foreground">{t("simulationHistory.filterHint")}</p>
      <Separator />
    </div>
  );

  return (
    <SidebarShell header={header}>
      <div>
        {runs.length === 0 && !loading && (
          <p className="px-3 py-4 text-center font-sans text-sm text-muted-foreground">
            {t("simulationHistory.emptyList")}
          </p>
        )}

        {runs.map((run) => {
          const displayName = run.name ?? t("simulationHistory.runNameFallback");
          const typeLabel =
            run.type === "generated"
              ? t("simulationHistory.runTypeGenerated")
              : t("simulationHistory.runTypeCustom");

          return (
            <div key={run.id}>
              <button
                type="button"
                onClick={() => onSelectRun(run.id)}
                className={cn(
                  "w-full px-3 pb-1 pt-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selectedRunId === run.id ? "bg-primary/10" : "hover:bg-accent",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="flex-1 truncate font-sans text-sm font-medium text-foreground"
                    title={displayName}
                  >
                    {displayName}
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANT[run.status]} className="shrink-0">
                    {t(STATUS_LABEL_KEY[run.status])}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {run.id.slice(0, 8)} · {typeLabel} ·{" "}
                  {t("simulationHistory.runMetaNetworks", { count: run.networkCount })} ·{" "}
                  {formatDate(run.createdAt)}
                </p>
              </button>

              {run.status === "running" && (
                <div className="flex items-center px-3 pb-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={t("simulationHistory.cancelRun")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestCancel(run.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {t("simulationHistory.cancelRun")}
                  </Button>
                </div>
              )}

              <Separator />
            </div>
          );
        })}

        {hasMore && (
          <div className="flex flex-col items-center gap-1 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={onLoadMore}
            >
              {loading ? t("common.loading") : t("simulationHistory.loadMore")}
            </Button>
            <span className="font-sans text-xs text-muted-foreground">
              {t("simulationHistory.perPage")}
            </span>
          </div>
        )}
      </div>

      {/* Cancel confirmation — the single shell dialog pattern */}
      <Dialog open={pendingCancelRun !== null} onOpenChange={(open) => !open && onDismissCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("simulationHistory.cancelDialogTitle")}</DialogTitle>
            <DialogDescription>{t("simulationHistory.cancelDialogBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDismissCancel}>
              {t("simulationHistory.cancelDialogDismiss")}
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmCancel}>
              {t("simulationHistory.cancelDialogConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarShell>
  );
}
