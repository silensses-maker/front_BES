import { useState } from "react";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { SidebarShell } from "@/shared/ui/sidebar-shell";

type StatusFilter = "all" | "running" | "completed" | "error";

interface SimulationHistoryPanelProps {
  runs: RunSummary[];
  loading: boolean;
  hasMore: boolean;
  selectedRunId: string | null;
  /** Status keyed by run id, derived from the simulation store in BoardPage */
  statusMap?: Record<string, string>;
  onSelectRun: (id: string) => void;
  onDeleteRun: (id: string) => void;
  onLoadMore: () => void;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "running") return "default";
  if (status === "completed") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

function inferStatus(run: RunSummary, statusMap: Record<string, string>): string {
  return statusMap[run.id] ?? "completed";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SimulationHistoryPanel({
  runs,
  loading,
  hasMore,
  selectedRunId,
  statusMap = {},
  onSelectRun,
  onDeleteRun,
  onLoadMore,
}: SimulationHistoryPanelProps) {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: t("simulationHistory.filterAll") },
    { key: "running", label: t("simulationHistory.filterRunning") },
    { key: "completed", label: t("simulationHistory.filterCompleted") },
    { key: "error", label: t("simulationHistory.filterError") },
  ];

  const filteredRuns =
    activeFilter === "all" ? runs : runs.filter((r) => inferStatus(r, statusMap) === activeFilter);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const handleDeleteConfirm = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingDeleteId(null);
    onDeleteRun(id);
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  const header = (
    <>
      <div className="flex flex-wrap gap-1 px-3 pb-2 pt-1">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-sans text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Separator />
    </>
  );

  return (
    <SidebarShell header={header}>
      <div>
        {filteredRuns.length === 0 && !loading && (
          <p className="px-3 py-4 text-center font-sans text-sm text-muted-foreground">
            {t("simulationHistory.emptyList")}
          </p>
        )}

        {filteredRuns.map((run) => {
          const status = inferStatus(run, statusMap);
          const isPendingDelete = pendingDeleteId === run.id;
          const displayName = run.name ?? t("simulationHistory.runNameFallback");

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
                  <Badge variant={statusBadgeVariant(status)} className="shrink-0 capitalize">
                    {t(
                      `simulationHistory.status${status.charAt(0).toUpperCase()}${status.slice(1)}` as Parameters<
                        typeof t
                      >[0],
                    )}
                  </Badge>
                </div>
                <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                  {formatDate(run.createdAt)}
                </p>
              </button>

              {/* ── Inline delete confirmation ──────────── */}
              <div className="flex items-center gap-1.5 px-3 pb-2">
                {isPendingDelete ? (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      aria-label={t("simulationHistory.deleteConfirmLabel")}
                      onClick={(e) => handleDeleteConfirm(e, run.id)}
                    >
                      {t("simulationHistory.deleteConfirmLabel")}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label={t("simulationHistory.deleteCancelLabel")}
                      onClick={handleDeleteCancel}
                    >
                      {t("common.cancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={t("simulationHistory.deleteRun")}
                    onClick={(e) => handleDeleteClick(e, run.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {t("simulationHistory.deleteRun")}
                  </Button>
                )}
              </div>

              <Separator />
            </div>
          );
        })}

        {/* ── Load more ───────────────────────────────────── */}
        {hasMore && (
          <div className="px-3 py-2">
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
          </div>
        )}
      </div>
    </SidebarShell>
  );
}
