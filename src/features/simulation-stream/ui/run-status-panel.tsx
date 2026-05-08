import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { SimulationStatus } from "@/entities/simulation";
import { useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";

// ─── Status display helpers (mirrors simulation-run-view.tsx) ─────────────────

const STATUS_DOT: Record<SimulationStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-yellow-500 animate-pulse",
  running: "bg-primary animate-pulse",
  completed: "bg-green-500",
  cancelled: "bg-muted-foreground",
  error: "bg-destructive",
};

const STATUS_KEYS: Record<SimulationStatus, string> = {
  idle: "simulation.statusIdle",
  connecting: "simulation.statusConnecting",
  running: "simulation.statusRunning",
  completed: "simulation.statusCompleted",
  cancelled: "simulation.statusCancelled",
  error: "simulation.statusError",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface RunStatusPanelProps {
  runId: string;
}

/**
 * Status panel injected into DashboardLayout's sidebar slot while a live-run
 * page is mounted. Reads directly from the simulation store because it is a
 * status-display primitive consumed by the layout, not a child of LiveRunPage.
 *
 * Mirrors the FSD shape of `SimulationHistoryPanel` (also a feature-slice UI
 * component injected into the same sidebar slot from the board page).
 */
export function RunStatusPanel({ runId }: RunStatusPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const status = useSimulationStore((s) => s.status);
  const topology = useSimulationStore((s) => s.topology);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const error = useSimulationStore((s) => s.error);

  const [cancelling, setCancelling] = useState(false);

  const agentCount = topology?.agentCount ?? null;
  const cancellable = status === "connecting" || status === "running";
  const isDone = status === "completed" || status === "cancelled";

  const handleCancel = useCallback(() => {
    toast.warning(t("liveRun.sidebar.cancelConfirm"), {
      action: {
        label: t("common.cancel"),
        onClick: async () => {
          setCancelling(true);
          try {
            await simulationsApi.cancel(runId);
            toast.success(t("liveRun.sidebar.cancelSuccess"));
            navigate("/board");
          } catch (err) {
            logger.error("RunStatusPanel.cancel", err);
            toast.error(t("liveRun.sidebar.errorCancel"));
          } finally {
            setCancelling(false);
          }
        },
      },
    });
  }, [runId, navigate, t]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* Status row */}
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])} />
        <span className="font-sans text-sm font-medium text-foreground">
          {t(STATUS_KEYS[status] as Parameters<typeof t>[0])}
        </span>
      </div>

      <Separator />

      {/* Round counter */}
      {currentRound > 0 && (
        <p className="font-sans text-xs text-muted-foreground">
          {t("liveRun.sidebar.roundLabel", { round: String(currentRound) })}
        </p>
      )}

      {/* Agent count */}
      {agentCount !== null && (
        <p className="font-sans text-xs text-muted-foreground">
          {t("liveRun.sidebar.agentCount", { count: String(agentCount) })}
        </p>
      )}

      {/* Run ID chip */}
      <p className="font-mono text-xs text-muted-foreground/60">{runId.slice(0, 8)}</p>

      <Separator />

      {/* Cancel button — only when active */}
      {cancellable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancelling}
          onClick={handleCancel}
        >
          {t("liveRun.sidebar.cancelButton")}
        </Button>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="font-sans text-xs font-medium text-destructive">
            {t("liveRun.sidebar.errorTitle")}
          </p>
          {error && <p className="font-mono text-xs text-muted-foreground">{error}</p>}
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/board")}>
            {t("liveRun.sidebar.backToBoard")}
          </Button>
        </div>
      )}

      {/* Back-to-board when done */}
      {isDone && (
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/board")}>
          {t("liveRun.sidebar.backToBoard")}
        </Button>
      )}
    </Card>
  );
}
