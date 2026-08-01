import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { DECLUSTER_PLAY_DELAY_MS, SimulationCanvas } from "@/features/simulation-canvas";
import {
  buildAgentRows,
  buildAgentRowsFromResults,
  buildNetworkRows,
  buildRoundRows,
  computeDegrees,
  computeFinalSpread,
  DataTablePanel,
  useDataTable,
} from "@/features/simulation-data-table";
import {
  findAdjacentEvent,
  startAggregatesSweep,
  TimelinePanel,
  usePlaybackEngine,
  useRoundEvents,
} from "@/features/simulation-replay";
import { RunChartsCard, RunStatusPanel, useSimulationStream } from "@/features/simulation-stream";
import type { ResultAgent } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { logger } from "@/shared/lib/logger";
import { cn } from "@/shared/lib/utils";
import type { DashboardOutletContext } from "@/shared/types/dashboard";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { decodeRunHotkey } from "./run-hotkeys";
import { useNetworkConsensus } from "./use-network-consensus";

type MainTab = "grafo" | "tabla";
type MaxPanel = "none" | "viz" | "chart";

/** Batch size cap for the lazy per-network final-spread fetch. */
const RESULTS_AGENT_LIMIT = 100_000;

interface RunViewProps {
  runId: string;
  networkId: string;
}

/**
 * Run viewer (mockup, main area): Grafo|Tabla toggle row, graph or data
 * table, timeline card and charts card — plus the run sidebar injection.
 * This is the page-layer composer: it instantiates every feature hook and
 * wires cross-feature callbacks (FSD: features never import features).
 */
export function RunView({ runId, networkId }: RunViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setSidebarContent } = useOutletContext<DashboardOutletContext>();

  const { status, topology } = useSimulationStream(runId, networkId);
  const agentCount = topology?.agents.length ?? null;

  const engine = usePlaybackEngine(runId, networkId, agentCount);
  const events = useRoundEvents();

  const latestFrame = useSimulationStore((s) => s.latestFrame);
  const selectedAgentIndex = useSimulationStore((s) => s.selectedAgentIndex);
  const consensus = useSimulationStore((s) => s.consensus);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const aggregatesVersion = useRoundAggregatesStore((s) => s.version);

  const [mainTab, setMainTab] = useState<MainTab>("grafo");
  const [maxPanel, setMaxPanel] = useState<MaxPanel>("none");
  const [runMeta, setRunMeta] = useState<{ iterationLimit: number } | null>(null);
  const [networkIds, setNetworkIds] = useState<string[]>([]);
  const [resultAgents, setResultAgents] = useState<ResultAgent[] | null>(null);
  const [finalSpreads, setFinalSpreads] = useState<Record<string, number>>({});

  const limited = engine.status === "unavailable";
  const isFinished = status === "completed" || status === "cancelled";

  // ── Run metadata (iteration limit — live progress/timeline denominator) ────
  useEffect(() => {
    let cancelled = false;
    simulationsApi
      .getById(runId)
      .then((run) => {
        if (!cancelled) setRunMeta({ iterationLimit: run.iterationLimit });
      })
      .catch((err: unknown) => logger.error("RunView.getById", err));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // ── Network list (ordinal, Redes dataset) ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    simulationsApi
      .listNetworks(runId)
      .then(({ networks }) => {
        if (!cancelled) setNetworkIds(networks);
      })
      .catch((err: unknown) => logger.error("RunView.listNetworks", err));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const multiNet = networkIds.length > 1;
  const networkOrdinal = multiNet ? networkIds.indexOf(networkId) + 1 : null;
  const consensusEntries = useNetworkConsensus(runId, multiNet ? networkIds : []);

  // ── Aggregates ingestion: every received frame feeds the per-round buffers ─
  useEffect(() => {
    const key = `${runId}|${networkId}`;
    const ingest = useRoundAggregatesStore.getState().ingest;
    const maybeIngest = (frame: MergedFrame | null) => {
      if (frame !== null && frame.networkId === networkId) ingest(key, frame);
    };
    maybeIngest(useSimulationStore.getState().receivedFrame);
    return useSimulationStore.subscribe((state) => maybeIngest(state.receivedFrame));
  }, [runId, networkId]);

  // ── Cold-load sweep: fill aggregates for rounds not received this session ──
  const framesAvailable = engine.status !== "unavailable" && engine.status !== "error";
  useEffect(() => {
    if (engine.finalRound === null || agentCount === null || !framesAvailable) return;
    const state = useRoundAggregatesStore.getState();
    if (state.sweepDone && state.key === `${runId}|${networkId}`) return;
    const handle = startAggregatesSweep({
      runId,
      networkId,
      agentCount,
      finalRound: engine.finalRound,
    });
    return () => handle.cancel();
  }, [runId, networkId, agentCount, engine.finalRound, framesAvailable]);

  // ── Verdict fallback + limited-viewer data (one /results fetch) ────────────
  useEffect(() => {
    if (status !== "completed" && status !== "cancelled") return;
    const needVerdict = consensus === null && status === "completed";
    const needAgents = limited && resultAgents === null;
    if (!needVerdict && !needAgents) return;
    let cancelled = false;
    const params = needAgents ? { limit: RESULTS_AGENT_LIMIT } : { limit: 0 };
    simulationsApi
      .getResults(runId, networkId, params)
      .then((results) => {
        if (cancelled || results === null) return;
        const store = useSimulationStore.getState();
        if (store.consensus === null) store.setConsensus(results.consensus);
        if (store.finalRound === null) store.setFinalRound(results.finalRound);
        if (needAgents) setResultAgents(results.agents);
      })
      .catch((err: unknown) => logger.error("RunView.getResults", err));
    return () => {
      cancelled = true;
    };
  }, [status, consensus, limited, resultAgents, runId, networkId]);

  // ── Table datasets ─────────────────────────────────────────────────────────
  const frame =
    latestFrame !== null && latestFrame.networkId === topology?.networkId ? latestFrame : null;
  const degrees = useMemo(
    () => (topology ? computeDegrees(topology) : { inDegree: new Map(), outDegree: new Map() }),
    [topology],
  );
  // Row building is gated on the table being visible — rebuilding per live
  // round while the graph tab is active would be pure waste (O(R²) over a run).
  const tableVisible = mainTab === "tabla";
  const agentRows = useMemo(() => {
    if (!topology || !tableVisible) return [];
    if (limited) {
      return resultAgents !== null
        ? buildAgentRowsFromResults(topology, resultAgents, degrees)
        : [];
    }
    return buildAgentRows(topology, frame, degrees);
  }, [topology, frame, degrees, limited, resultAgents, tableVisible]);

  const roundRows = useMemo(() => {
    if (limited || !tableVisible) return [];
    void aggregatesVersion;
    const { aggregates, maxRound } = useRoundAggregatesStore.getState();
    return buildRoundRows(aggregates, maxRound);
  }, [limited, aggregatesVersion, tableVisible]);

  const networkRows = useMemo(
    () => buildNetworkRows(networkIds, consensusEntries, finalSpreads),
    [networkIds, consensusEntries, finalSpreads],
  );

  const table = useDataTable({
    agentRows,
    roundRows,
    networkRows,
    hasNetworks: multiNet,
    hasRounds: !limited,
  });

  // ── Lazy final-spread fetch for the VISIBLE page of the Redes dataset ──────
  useEffect(() => {
    if (table.dataset !== "networks") return;
    const missing = table.pageNetworkRows.filter(
      (row) => row.consensus !== null && row.finalSpread === null,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (row) => {
        try {
          const results = await simulationsApi.getResults(runId, row.networkId, {
            limit: RESULTS_AGENT_LIMIT,
          });
          if (results === null) return null;
          const spread = computeFinalSpread(results.agents);
          return spread === null ? null : { networkId: row.networkId, spread };
        } catch (err) {
          logger.error("RunView.finalSpread", err);
          return null;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      const additions = resolved.filter(
        (r): r is { networkId: string; spread: number } => r !== null,
      );
      if (additions.length === 0) return;
      setFinalSpreads((prev) => {
        const next = { ...prev };
        for (const { networkId: id, spread } of additions) next[id] = spread;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [table.dataset, table.pageNetworkRows, runId]);

  // ── Sidebar injection ──────────────────────────────────────────────────────
  const resultsSpread = useMemo(
    () => (resultAgents !== null ? computeFinalSpread(resultAgents) : null),
    [resultAgents],
  );
  useEffect(() => {
    setSidebarContent(
      <RunStatusPanel
        runId={runId}
        iterationLimit={runMeta?.iterationLimit ?? null}
        networkOrdinal={networkOrdinal}
        networkTotal={multiNet ? networkIds.length : null}
        resultsSpread={resultsSpread}
      />,
    );
    return () => setSidebarContent(null);
  }, [
    setSidebarContent,
    runId,
    runMeta,
    networkOrdinal,
    multiNet,
    networkIds.length,
    resultsSpread,
  ]);

  // ── Timeline domain ────────────────────────────────────────────────────────
  const domainEnd = engine.isLive
    ? Math.max(runMeta?.iterationLimit ?? 0, engine.receivedRound, 1)
    : Math.max(engine.finalRound ?? 0, 1);

  // ── Play diferido con clustering activo ────────────────────────────────────
  // Pressing play while grouped first runs the de-cluster animation and only
  // starts advancing rounds at ~80% of it, so the two motions never overlap.
  // Pressing play again during the wait cancels it (toggle semantics).
  const clusterActiveRef = useRef(false);
  const pendingPlayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingPlay, setPendingPlay] = useState(false);

  const handleClusterActiveChange = useCallback((active: boolean) => {
    clusterActiveRef.current = active;
  }, []);

  const cancelPendingPlay = useCallback(() => {
    if (pendingPlayRef.current !== null) {
      clearTimeout(pendingPlayRef.current);
      pendingPlayRef.current = null;
    }
    setPendingPlay(false);
  }, []);

  useEffect(() => cancelPendingPlay, [cancelPendingPlay]);

  // The engine's callbacks are useCallback-stable; destructuring keeps the
  // wrapped toggle and the hotkeys effect from churning on state changes.
  const { seek, stepBy, goToEnd, isPlaying } = engine;
  const enginePlay = engine.play;
  const engineTogglePlay = engine.togglePlay;

  const togglePlayDeclustered = useCallback(() => {
    if (pendingPlayRef.current !== null) {
      cancelPendingPlay();
      return;
    }
    if (!isPlaying && clusterActiveRef.current) {
      // pendingPlay feeds playbackActive → the canvas de-clusters animated
      setPendingPlay(true);
      pendingPlayRef.current = setTimeout(() => {
        pendingPlayRef.current = null;
        setPendingPlay(false);
        enginePlay();
      }, DECLUSTER_PLAY_DELAY_MS);
      return;
    }
    engineTogglePlay();
  }, [isPlaying, enginePlay, engineTogglePlay, cancelPendingPlay]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const togglePlay = togglePlayDeclustered;
  const jumpEvent = useCallback(
    (dir: 1 | -1) => {
      const candidate = findAdjacentEvent(events, useSimulationStore.getState().currentRound, dir);
      if (candidate !== null) seek(candidate.round);
    },
    [events, seek],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = ((e.target as HTMLElement | null)?.tagName ?? "").toLowerCase();
      const action = decodeRunHotkey({
        key: e.key,
        shiftKey: e.shiftKey,
        targetTag,
        totalRounds: domainEnd,
      });
      if (action === null) return;
      if (action.type === "escape") {
        if (maxPanel !== "none") {
          e.preventDefault();
          setMaxPanel("none");
        }
        return;
      }
      if (limited) return;
      e.preventDefault();
      switch (action.type) {
        case "step":
          stepBy(action.delta);
          break;
        case "home":
          seek(0);
          break;
        case "end":
          goToEnd();
          break;
        case "toggle-play":
          togglePlay();
          break;
        case "event":
          jumpEvent(action.dir);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [domainEnd, maxPanel, limited, seek, stepBy, goToEnd, togglePlay, jumpEvent]);

  // ── Stream-error state (mockup) ────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-95 text-center">
          <div className="mx-auto mb-3.5 flex size-12 items-center justify-center rounded-full bg-destructive/12 text-xl text-destructive">
            !
          </div>
          <p className="mb-1 font-sans text-base font-semibold text-foreground">
            {t("runView.streamErrorTitle")}
          </p>
          <p className="mb-4 font-sans text-[13px] text-muted-foreground">
            {t("runView.streamErrorBody")}
          </p>
          <Button type="button" onClick={() => navigate(0)}>
            {t("runView.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const vizNote =
    mainTab === "tabla"
      ? table.dataset === "agents"
        ? t("runView.vizNoteAgents", { round: formatNumber(currentRound, i18n.language) })
        : table.dataset === "rounds"
          ? t("runView.vizNoteRounds")
          : t("runView.vizNoteNetworks")
      : t("runView.vizNoteGraph");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Limited-viewer banner ────────────────────────────── */}
      {limited && (
        <p className="mx-4 mt-3 rounded-[10px] border border-warn/40 bg-warn/10 px-3.5 py-2.5 font-sans text-xs text-warn">
          {t("runView.limitedBanner")}
        </p>
      )}

      {/* ── Viz toggle row ───────────────────────────────────── */}
      {maxPanel !== "chart" && (
        <>
          <div className="mx-4 mt-3 flex flex-none items-center gap-2.5">
            <span className="flex gap-0.75 rounded-[9px] border border-border bg-muted p-0.75">
              {(["grafo", "tabla"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMainTab(tab)}
                  className={cn(
                    "h-7.25 flex-1 rounded-[7px] px-4 font-sans text-[12.5px] font-medium",
                    mainTab === tab
                      ? "bg-card font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--color-border)]"
                      : "text-muted-foreground",
                  )}
                >
                  {tab === "grafo" ? t("runView.vizGraph") : t("runView.vizTable")}
                </button>
              ))}
            </span>
            <span className="flex-1 truncate font-sans text-[11.5px] text-muted-foreground">
              {vizNote}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("runView.maximizeVizAria")}
                  onClick={() => setMaxPanel(maxPanel === "viz" ? "none" : "viz")}
                >
                  {maxPanel === "viz" ? <Minimize2 /> : <Maximize2 />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {maxPanel === "viz" ? t("runView.restoreVizTip") : t("runView.maximizeVizTip")}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* ── Graph / Table panel ────────────────────────────── */}
          {mainTab === "grafo" ? (
            <div className="relative mx-4 mt-2.5 min-h-65 flex-1 overflow-hidden rounded-xl border border-border">
              {/* Clustering suspends whenever rounds auto-advance: replay
                  playback, the live tail, and the pre-play de-cluster wait */}
              <SimulationCanvas
                status={status}
                topology={topology}
                playbackActive={engine.isPlaying || pendingPlay || (engine.isLive && engine.follow)}
                onClusterActiveChange={handleClusterActiveChange}
              />
            </div>
          ) : (
            <div className="mx-4 mt-2.5 flex min-h-65 flex-1 flex-col">
              <DataTablePanel
                table={table}
                runId={runId}
                networkOrdinal={networkOrdinal}
                viewedRound={currentRound}
                selectedAgentIndex={selectedAgentIndex}
                currentNetworkId={networkId}
                onSelectAgent={(index) =>
                  useSimulationStore.getState().setSelectedAgentIndex(index)
                }
                onSeekRound={engine.seek}
                onSelectNetwork={(id) => navigate(`/board/simulation/${runId}/${id}`)}
              />
            </div>
          )}
        </>
      )}

      {/* ── Timeline ─────────────────────────────────────────── */}
      {!limited && (
        <div className="mx-4 my-2.5 flex-none">
          <TimelinePanel
            engine={{ ...engine, togglePlay: togglePlayDeclustered }}
            events={events}
            domainEnd={domainEnd}
          />
        </div>
      )}

      {/* ── Charts card ──────────────────────────────────────── */}
      {!limited && maxPanel !== "viz" && (
        <div
          className={cn("mx-4 mb-3.5 flex min-h-0 flex-col", maxPanel === "chart" && "mt-3 flex-1")}
        >
          <RunChartsCard
            maximized={maxPanel === "chart"}
            onToggleMaximize={() => setMaxPanel(maxPanel === "chart" ? "none" : "chart")}
          />
        </div>
      )}

      {/* Spacer keeps the cancelled/limited layouts from collapsing */}
      {limited && isFinished && <div className="mb-3.5" />}
    </div>
  );
}
