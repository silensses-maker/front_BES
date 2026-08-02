import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { SimulationStatus } from "@/entities/simulation";
import {
  useLastRunStore,
  useRoundAggregatesStore,
  useSimulationStore,
} from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { useWsAuthState } from "@/shared/lib/ws-manager";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/dialog";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { NetworkCompositionCard } from "./network-composition-card";
import { NodeInspectorCard } from "./node-inspector-card";

// ─── Status display (mockup stMap) ────────────────────────────────────────────

type DisplayStatus = SimulationStatus | "reconnecting";

const STATUS_DOT: Record<DisplayStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-primary animate-pulse",
  running: "bg-primary animate-pulse",
  reconnecting: "bg-warn animate-pulse",
  completed: "bg-ok",
  cancelled: "bg-muted-foreground",
  error: "bg-destructive",
};

const STATUS_KEYS: Record<DisplayStatus, string> = {
  idle: "runView.statusIdle",
  connecting: "runView.statusRunning",
  running: "runView.statusRunning",
  reconnecting: "runView.statusReconnecting",
  completed: "runView.statusCompleted",
  cancelled: "runView.statusCancelled",
  error: "runView.statusError",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function InfoRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RunStatusPanelProps {
  runId: string;
  /** Iteration limit — the live progress denominator; null while unknown. */
  iterationLimit: number | null;
  /** 1-based position of the current network within the run; null single-net. */
  networkOrdinal: number | null;
  networkTotal: number | null;
  /** Fallback "diferencia final entre creencias" from /results (limited viewer). */
  resultsSpread: number | null;
  /** "Redes (N)" browser injected by the page for multi-network runs (#112). */
  networksSlot?: React.ReactNode;
}

/**
 * "Panel de ejecución" (mockup): status card with progress, verdict card,
 * Red card, Composición card, node inspector, and the cancel/back footer.
 * Reads the simulation store directly — it is a status-display primitive
 * consumed by the layout's sidebar slot.
 */
export function RunStatusPanel({
  runId,
  iterationLimit,
  networkOrdinal,
  networkTotal,
  resultsSpread,
  networksSlot,
}: RunStatusPanelProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const wsAuthState = useWsAuthState();

  const status = useSimulationStore((s) => s.status);
  const topology = useSimulationStore((s) => s.topology);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const receivedRound = useSimulationStore((s) => s.receivedRound);
  const finalRound = useSimulationStore((s) => s.finalRound);
  const consensus = useSimulationStore((s) => s.consensus);
  const error = useSimulationStore((s) => s.error);
  const aggregatesVersion = useRoundAggregatesStore((s) => s.version);

  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const fmt = (n: number) => formatNumber(n, i18n.language);
  const isLive = status === "running" || status === "connecting";
  const isReconnecting = isLive && wsAuthState === "reconnecting";
  const displayStatus: DisplayStatus = isReconnecting ? "reconnecting" : status;
  const cancellable = isLive;

  // Dispersión final: aggregates at the final round, else the /results fallback
  const finalSpread = (() => {
    void aggregatesVersion;
    if (finalRound === null) return resultsSpread;
    const agg = useRoundAggregatesStore.getState().aggregates[finalRound];
    return agg?.spread ?? resultsSpread;
  })();

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      await simulationsApi.cancel(runId);
      setCancelOpen(false);
      // Mockup: stay in the viewer — received data is kept
      useSimulationStore.getState().setStatus("cancelled");
      const lastRun = useLastRunStore.getState();
      if (lastRun.runId === runId) lastRun.setStatus("cancelled");
      toast.warning(t("runView.cancelledToast"));
    } catch (err) {
      void err;
      toast.error(t("liveRun.sidebar.errorCancel"));
    } finally {
      setCancelling(false);
    }
  }, [runId, t]);

  // Progress copy (mockup): "Ronda X[ · última]" / "recibidas X / Y" | "Y rondas"
  const isAtFinal = status === "completed" && finalRound !== null && currentRound === finalRound;
  const roundLabel = isAtFinal
    ? t("runView.roundProgressLast", { round: fmt(currentRound) })
    : t("runView.roundProgress", { round: fmt(currentRound) });
  const totalLabel = isLive
    ? iterationLimit !== null
      ? t("runView.receivedProgress", { received: fmt(receivedRound), total: fmt(iterationLimit) })
      : t("runView.receivedProgress", { received: fmt(receivedRound), total: "…" })
    : finalRound !== null
      ? t("runView.totalRounds", { count: finalRound, display: fmt(finalRound) })
      : "";
  const progressPct = isLive
    ? iterationLimit !== null && iterationLimit > 0
      ? Math.min(100, (receivedRound / iterationLimit) * 100)
      : 0
    : 100;

  const showVerdict = status === "completed" && consensus !== null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3.5">
          {/* ── Status card ─────────────────────────────────── */}
          <Card className="gap-0 rounded-[10px] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[displayStatus])}
                aria-hidden="true"
              />
              <span className="font-sans text-sm font-semibold text-foreground">
                {t(STATUS_KEYS[displayStatus] as Parameters<typeof t>[0])}
              </span>
            </div>
            {isReconnecting && (
              <p className="mt-1 animate-pulse font-sans text-[11.5px] text-warn">
                {t("runView.reconnectingLine")}
              </p>
            )}
            {topology !== null && (
              <div className="mt-2">
                <div className="mb-1 flex justify-between font-sans text-[11.5px] text-muted-foreground">
                  <span>{roundLabel}</span>
                  <span>{totalLabel}</span>
                </div>
                <div className="h-1.25 overflow-hidden rounded-[3px] bg-accent">
                  <div
                    className="h-full rounded-[3px] bg-primary"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* ── Verdict card ────────────────────────────────── */}
          {showVerdict && (
            <div
              className={cn(
                "rounded-[10px] border px-3.5 py-3",
                consensus ? "border-ok/40 bg-ok/10 text-ok" : "border-warn/40 bg-warn/10 text-warn",
              )}
            >
              <p className="mb-0.5 font-sans text-sm font-semibold">
                {consensus ? t("runView.verdictConsensus") : t("runView.verdictNoConsensus")}
              </p>
              <p className="font-sans text-xs opacity-85">
                {finalRound !== null && finalSpread !== null
                  ? t("runView.verdictBody", {
                      round: fmt(finalRound),
                      spread: finalSpread.toFixed(3),
                    })
                  : finalRound !== null
                    ? t("runView.verdictBodyNoSpread", { round: fmt(finalRound) })
                    : ""}
              </p>
            </div>
          )}

          {/* ── Networks browser (#112, multi-network runs) ── */}
          {networksSlot}

          {/* ── Red card ────────────────────────────────────── */}
          <Card className="gap-0 rounded-[10px] px-3.5 py-3">
            <Eyebrow>{t("runView.networkCardTitle")}</Eyebrow>
            <InfoRow
              label={t("runView.networkAgents")}
              value={topology ? fmt(topology.agentCount) : "—"}
            />
            <InfoRow
              label={t("runView.networkEdges")}
              value={topology ? fmt(topology.edgeCount) : "—"}
            />
            <InfoRow
              label={t("runView.networkCardTitle")}
              value={t("runView.networkPosition", {
                index: fmt(networkOrdinal ?? 1),
                total: fmt(networkTotal ?? 1),
              })}
              mono={false}
            />
          </Card>

          {/* ── Composición card ────────────────────────────── */}
          {topology !== null && <NetworkCompositionCard topology={topology} />}

          {/* ── Node inspector ──────────────────────────────── */}
          <NodeInspectorCard />

          {status === "error" && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3.5 py-3">
              <p className="font-sans text-xs font-medium text-destructive">
                {t("liveRun.sidebar.errorTitle")}
              </p>
              {error && <p className="font-mono text-xs text-muted-foreground">{error}</p>}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Footer actions ──────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3.5">
        {cancellable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-destructive/45 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={cancelling}
            onClick={() => setCancelOpen(true)}
          >
            {t("runView.cancelButton")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          // Mockup volverTablero: back to the board's history panel
          onClick={() => navigate("/board/experiments")}
        >
          {t("runView.backToBoard")}
        </Button>
      </div>

      {/* ── Cancel dialog (mockup copy) ─────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent showCloseButton={false} className="w-100">
          <DialogTitle>{t("runView.cancelDialogTitle")}</DialogTitle>
          <DialogDescription>{t("runView.cancelDialogBody")}</DialogDescription>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => setCancelOpen(false)}
            >
              {t("runView.cancelDialogKeep")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {t("runView.cancelDialogConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
