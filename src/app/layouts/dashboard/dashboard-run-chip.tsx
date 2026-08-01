import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { type LastRunStatus, useLastRunStore, useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { cn } from "@/shared/lib/utils";

const DOT_CLASS: Record<LastRunStatus, string> = {
  running: "bg-primary animate-pulse",
  completed: "bg-muted-foreground",
  cancelled: "bg-muted-foreground",
  error: "bg-destructive",
};

/**
 * Header chip for the active / most recent run. While the run streams it shows
 * the live round; otherwise it offers a jump back to the last run.
 *
 * On mount, a persisted "running" status is reconciled against the backend via
 * getById (the run may have finished — or been purged — while the tab was
 * closed). Reconciliation is skipped while the simulation store is actively
 * streaming that same run, so a racing REST response can't clobber fresher
 * WS-driven state.
 */
export function DashboardRunChip() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const runId = useLastRunStore((s) => s.runId);
  const status = useLastRunStore((s) => s.status);
  const round = useLastRunStore((s) => s.round);

  useEffect(() => {
    if (runId === null || status !== "running") return;
    const live = useSimulationStore.getState();
    if (live.runId === runId && live.status !== "idle") return;

    let cancelled = false;
    simulationsApi
      .getById(runId)
      .then((run) => {
        if (cancelled) return;
        useLastRunStore.getState().reconcile({
          name: run.name,
          status: run.status,
          networkCount: run.networkCount,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error("DashboardRunChip.reconcile", err);
        useLastRunStore.getState().clear();
      });
    return () => {
      cancelled = true;
    };
  }, [runId, status]);

  if (runId === null) return null;

  const label =
    status === "running"
      ? t("dashboard.runChipRunning", { round: String(round) })
      : t("dashboard.runChipLast");

  return (
    <button
      type="button"
      onClick={() => navigate(`/board/simulation/${runId}`)}
      className={cn(
        "hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 font-sans text-xs md:flex",
        "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[status])}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}
