import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { SimulationStatus } from "@/entities/simulation";
import { useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { NodeInspectorCard } from "./node-inspector-card";

// ─── Status display helpers ───────────────────────────────────────────────────

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
            void err;
            toast.error(t("liveRun.sidebar.errorCancel"));
          } finally {
            setCancelling(false);
          }
        },
      },
    });
  }, [runId, navigate, t]);

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      {/* ── Fixed header ──────────────────────────────────────── */}
      <div className="shrink-0 p-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])} />
          <span className="font-sans text-sm font-medium text-foreground">
            {t(STATUS_KEYS[status] as Parameters<typeof t>[0])}
          </span>
        </div>
      </div>

      <Separator />

      {/* ── Scrollable body ───────────────────────────────────── */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {currentRound > 0 && (
            <p className="font-sans text-xs text-muted-foreground">
              {t("liveRun.sidebar.roundLabel", { round: String(currentRound) })}
            </p>
          )}

          {agentCount !== null && (
            <p className="font-sans text-xs text-muted-foreground">
              {t("liveRun.sidebar.agentCount", { count: String(agentCount) })}
            </p>
          )}

          <p className="font-mono text-xs text-muted-foreground/60">{runId.slice(0, 8)}</p>

          <NodeInspectorCard />
        </div>
      </ScrollArea>

      {/* ── Fixed footer — action buttons ─────────────────────── */}
      {(cancellable || isDone || status === "error") && (
        <>
          <Separator />
          <div className="shrink-0 p-4">
            {cancellable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={cancelling}
                onClick={handleCancel}
              >
                {t("liveRun.sidebar.cancelButton")}
              </Button>
            )}

            {status === "error" && (
              <div className="flex flex-col gap-2">
                <p className="font-sans text-xs font-medium text-destructive">
                  {t("liveRun.sidebar.errorTitle")}
                </p>
                {error && <p className="font-mono text-xs text-muted-foreground">{error}</p>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate("/board")}
                >
                  {t("liveRun.sidebar.backToBoard")}
                </Button>
              </div>
            )}

            {isDone && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => navigate("/board")}
              >
                {t("liveRun.sidebar.backToBoard")}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
