import type {
  CosmographConfig,
  CosmographData,
  CosmographDataPrepResult,
  CosmographRef,
} from "@cosmograph/react";
import { Cosmograph, prepareCosmographData } from "@cosmograph/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SimulationStatus } from "@/entities/simulation";
import { useSimulationStore } from "@/entities/simulation";
import type { TopologyResponse } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import {
  interpolateDivergence,
  interpolateOpinion,
  OPINION_PALETTE,
} from "@/shared/lib/opinion-palette";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { topologyToData } from "../lib/topology-to-data";
import { CanvasLegend } from "./canvas-legend";
import type { ClusterMode } from "./cluster-toggle";
import { ClusterToggle } from "./cluster-toggle";
import type { ColorBy } from "./color-by-select";
import { ColorBySelect } from "./color-by-select";

// ─── Types ────────────────────────────────────────────────────────────────────

type CanvasPhase = "idle" | "preparing" | "layouting" | "frozen" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration (ms) the force-directed layout runs before freezing. */
const LAYOUT_DURATION_MS = 5_000;

/** Duration (ms) the clustering re-run executes before re-freezing. */
const CLUSTER_REANIMATE_MS = 4_000;

/** Duration (ms) of the animated return to the organic layout on de-cluster. */
const DECLUSTER_ANIMATE_MS = 2_000;

/**
 * Wait before playback actually starts when play is pressed with clustering
 * active (user decision): the FULL de-cluster animation runs before rounds
 * begin to advance, so the two motions never overlap.
 */
export const DECLUSTER_PLAY_DELAY_MS = DECLUSTER_ANIMATE_MS;

/** Categorical palette for "Colorear por estrategia" (mockup PAL). */
const STRATEGY_COLORS = ["#4f6bd8", "#7cb342", "#f59e0b", "#ec4899", "#8b5cf6"] as const;

// ─── Base config (layouting defaults) ────────────────────────────────────────

const BASE_CONFIG: CosmographConfig = {
  pointColorBy: "initialBelief",
  pointColorStrategy: "continuous",
  pointColorPalette: [...OPINION_PALETTE],
  pointSizeStrategy: "single",
  pointDefaultSize: 8,
  pointShapeBy: "selfLoop",
  linkColorStrategy: "single",
  linkDefaultColor: "#cccccc",
  linkGreyoutOpacity: 0.1,
  curvedLinks: true,
  curvedLinkWeight: 0.3,
  backgroundColor: "#0a0a0a",
  disableLogging: true,
  enableSimulation: true,
  preservePointPositionsOnDataUpdate: false,
  // Force-layout tuning — break the circular default by pushing nodes apart
  // and reducing the central pull. Empirically tuned for typical SOM runs.
  simulationRepulsion: 1.5,
  simulationLinkDistance: 4,
  simulationGravity: 0.05,
  simulationFriction: 0.85,
  simulationDecay: 1500,
};

const FREEZE_FLAGS: CosmographConfig = {
  enableSimulation: false,
  preservePointPositionsOnDataUpdate: true,
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SimulationCanvasProps {
  status: SimulationStatus;
  topology: TopologyResponse | null;
  /**
   * True while rounds auto-advance (replay playback or the live tail).
   * Clustering is suspended entirely during auto-advance (per-frame belief
   * reassignment is what lags; static modes follow the same rule for a
   * uniform UX); manual round stepping keeps it available and animates at
   * the user's pace.
   */
  playbackActive?: boolean;
  /** Reports whether any grouping is active — the page delays play with it. */
  onClusterActiveChange?: (active: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SimulationCanvas({
  status,
  topology,
  playbackActive = false,
  onClusterActiveChange,
}: SimulationCanvasProps) {
  const { t } = useTranslation();

  // Maps numeric SilenceStrategy values → localized names for cluster labels.
  // useCallback keeps the reference stable so Cosmograph's isEqual guard
  // doesn't trigger a re-upload on every parent render; only re-creates
  // when the locale changes (t reference changes).
  const silenceStrategyLabel = useCallback(
    (value: unknown): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceStrategy.degroot"),
        1: t("enums.silenceStrategy.majority"),
        2: t("enums.silenceStrategy.threshold"),
        3: t("enums.silenceStrategy.confidence"),
      };
      return map[value as number] ?? String(value);
    },
    [t],
  );

  const setSelectedAgentIndex = useSimulationStore((s) => s.setSelectedAgentIndex);
  const selectedAgentIndex = useSimulationStore((s) => s.selectedAgentIndex);
  // The VIEWED frame — live tail while following, or whatever round the
  // playback engine rendered. Drives per-agent color/size (#99 mechanism).
  const latestFrame = useSimulationStore((s) => s.latestFrame);
  const currentRound = useSimulationStore((s) => s.currentRound);
  // Maps Cosmograph's sequential internal index → agent.index from topology.
  // Rebuilt each time topology is processed (same useEffect below).
  const agentIndexMapRef = useRef<number[]>([]);

  // ─── "Colorear por" (replaces the Initial/Final toggle — round 0 = initial) ─
  const [colorBy, setColorBy] = useState<ColorBy>("pub");
  // Guard against a stale frame from a previous run/network
  const frame =
    latestFrame !== null && latestFrame.networkId === topology?.networkId ? latestFrame : null;

  const strategyByIndex = useMemo(() => {
    const map = new Map<number, number>();
    if (topology) {
      for (const agent of topology.agents) map.set(agent.index, agent.silenceStrategy);
    }
    return map;
  }, [topology]);

  const initialBeliefByIndex = useMemo(() => {
    const map = new Map<number, number>();
    if (topology) {
      for (const agent of topology.agents) map.set(agent.index, agent.initialBelief);
    }
    return map;
  }, [topology]);

  const strategyLegendEntries = useMemo(() => {
    if (!topology) return [];
    const present = [...new Set(topology.agents.map((a) => a.silenceStrategy))].sort(
      (a, b) => a - b,
    );
    return present.map((strategy) => ({
      label: silenceStrategyLabel(strategy),
      color: STRATEGY_COLORS[strategy % STRATEGY_COLORS.length] ?? "#888888",
    }));
  }, [topology, silenceStrategyLabel]);

  // Reads by the `agentIndex` column value (Cosmograph passes the column value
  // reliably; the optional 2nd `index` arg is not dependable). Without a frame
  // (layout warm-up, round 0 not yet rendered) beliefs fall back to initial.
  const colorByFn = useCallback(
    (value: unknown): string => {
      const agentIdx = Number(value);
      if (!Number.isFinite(agentIdx)) return OPINION_PALETTE[1];
      if (colorBy === "estr") {
        const strategy = strategyByIndex.get(agentIdx) ?? 0;
        return STRATEGY_COLORS[strategy % STRATEGY_COLORS.length] ?? OPINION_PALETTE[1];
      }
      const fallback = initialBeliefByIndex.get(agentIdx) ?? 0.5;
      const pub = frame?.publicBelief[agentIdx] ?? fallback;
      const priv = frame?.privateBelief[agentIdx] ?? fallback;
      if (colorBy === "pub") return interpolateOpinion(pub);
      if (colorBy === "priv") return interpolateOpinion(priv);
      return interpolateDivergence(Math.abs(pub - priv));
    },
    [colorBy, frame, strategyByIndex, initialBeliefByIndex],
  );

  const speakingSizeByFn = useCallback(
    (value: unknown): number => {
      const agentIdx = Number(value);
      if (frame === null || !Number.isFinite(agentIdx)) return 8;
      return frame.speaking[agentIdx] ? 14 : 8;
    },
    [frame],
  );

  const cosmographRef = useRef<CosmographRef>(undefined);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<CanvasPhase>("idle");
  const [prepResult, setPrepResult] = useState<CosmographDataPrepResult<CosmographData> | null>(
    null,
  );
  const [clusterMode, setClusterMode] = useState<ClusterMode | null>(null);
  const [linksHidden, setLinksHidden] = useState(false);

  // Declarative config overlay applied on top of BASE_CONFIG in JSX.
  // Controlled exclusively through React state — no imperative setConfig calls.
  // This ensures Cosmograph's isEqual guard detects real flag changes (e.g.
  // enableSimulation true→false) and always calls setConfig with `points`
  // included, avoiding the "_uploadAndValidateGraphData: no points" error that
  // a partial imperative setConfig (without points) causes.
  const [canvasOverride, setCanvasOverride] = useState<CosmographConfig>({});

  // Stable style object — prevents React.memo from re-rendering <Cosmograph>
  // on every SimulationCanvas render due to a new object literal reference.
  const canvasStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);

  // ─── Topology → prepareCosmographData ─────────────────────────────────────

  useEffect(() => {
    // Reset if topology is cleared
    if (!topology) {
      setPhase("idle");
      setPrepResult(null);
      setClusterMode(null);
      setCanvasOverride({});
      setSelectedAgentIndex(null);
      setColorBy("pub");
      return;
    }

    // Only prepare once per topology instance (object identity guard)
    let cancelled = false;
    setPhase("preparing");

    const run = async () => {
      try {
        const { rawPoints, rawLinks, dataPrepConfig } = topologyToData(topology);
        agentIndexMapRef.current = topology.agents.map((a) => a.index);
        const result = await prepareCosmographData(dataPrepConfig, rawPoints, rawLinks);
        if (cancelled) return;
        if (!result) {
          throw new Error("prepareCosmographData returned undefined");
        }
        setPrepResult(result);
        setPhase("layouting");
      } catch (err) {
        if (cancelled) return;
        logger.error("SimulationCanvas.prepareCosmographData", err);
        setPhase("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [topology, setSelectedAgentIndex]);

  // ─── Layout timer — freeze after LAYOUT_DURATION_MS ──────────────────────

  useEffect(() => {
    if (phase !== "layouting") return;

    layoutTimerRef.current = setTimeout(() => {
      // Drive freeze entirely through JSX props so Cosmograph's isEqual guard
      // detects the enableSimulation change and calls setConfig with `points`
      // included. An imperative setConfig without `points` triggers an internal
      // Cosmograph validation error and likely resets its GPU state.
      setCanvasOverride(FREEZE_FLAGS);
      setPhase("frozen");
    }, LAYOUT_DURATION_MS);

    return () => {
      if (layoutTimerRef.current !== null) {
        clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
    };
  }, [phase]);

  const beliefLabel = useCallback(
    (value: unknown): string => {
      const v = value as number;
      if (v < 0.25) return t("enums.beliefGroup.q1");
      if (v < 0.5) return t("enums.beliefGroup.q2");
      if (v < 0.75) return t("enums.beliefGroup.q3");
      return t("enums.beliefGroup.q4");
    },
    [t],
  );

  // Cluster key for "Agrupar · Creencia": quartile of the belief at the
  // VIEWED round (falls back to the initial belief before any frame exists).
  // Receives the `agentIndex` column value. The identity of this callback
  // changes with every rendered frame — that is what makes Cosmograph
  // re-evaluate cluster assignments during playback (see the nudge effect).
  const liveBeliefLabel = useCallback(
    (value: unknown): string => {
      const agentIdx = Number(value);
      const belief =
        (Number.isFinite(agentIdx) ? frame?.publicBelief[agentIdx] : undefined) ??
        initialBeliefByIndex.get(agentIdx) ??
        0.5;
      return beliefLabel(belief);
    },
    [frame, initialBeliefByIndex, beliefLabel],
  );

  const silenceEffectLabel = useCallback(
    (value: unknown): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceEffect.degroot"),
        1: t("enums.silenceEffect.memory"),
        2: t("enums.silenceEffect.memoryless"),
      };
      return map[value as number] ?? String(value);
    },
    [t],
  );

  // ─── Cluster mode handler ─────────────────────────────────────────────────

  const handleClusterMode = useCallback(
    (next: ClusterMode | null) => {
      if (prepResult === null) return;

      setClusterMode(next);

      if (clusterTimerRef.current !== null) {
        clearTimeout(clusterTimerRef.current);
        clusterTimerRef.current = null;
      }
      if (clusterStartTimerRef.current !== null) {
        clearTimeout(clusterStartTimerRef.current);
        clusterStartTimerRef.current = null;
      }

      if (next !== null) {
        const pointClusterBy =
          next === "strategy"
            ? "silenceStrategy"
            : next === "effect"
              ? "silenceEffect"
              : "agentIndex";
        setCanvasOverride({
          pointClusterBy,
          showClusterLabels: true,
          preservePointPositionsOnDataUpdate: false,
          // Pull nodes strongly towards their cluster centroid.
          // Default simulationCluster is 0.1 which is too weak to produce
          // visible separation; 0.7 gives tight, clearly distinct groups.
          simulationCluster: 0.7,
          simulationGravity: 0.25,
        });

        clusterStartTimerRef.current = setTimeout(() => {
          cosmographRef.current?.start(1);
          clusterStartTimerRef.current = null;
        }, 100);

        // "Creencia" follows the VIEWED round: the simulation is left enabled
        // (never re-frozen) so nodes migrate between belief groups as the
        // playback advances; it cools down on its own when rounds stop
        // changing. Static groupings (strategy/effect) re-freeze as before.
        if (next !== "belief") {
          clusterTimerRef.current = setTimeout(() => {
            setCanvasOverride({
              ...FREEZE_FLAGS,
              pointClusterBy,
              showClusterLabels: true,
            });
            clusterTimerRef.current = null;
          }, CLUSTER_REANIMATE_MS);
        }
      } else {
        // De-cluster ANIMATED: re-enable the simulation without cluster force
        // so repulsion/links pull the layout back to its organic arrangement,
        // then freeze. (Play-with-clustering waits DECLUSTER_PLAY_DELAY_MS so
        // this animation runs mostly alone before rounds start advancing.)
        setCanvasOverride({
          preservePointPositionsOnDataUpdate: false,
          simulationCluster: 0.1,
          simulationGravity: BASE_CONFIG.simulationGravity,
        });

        clusterStartTimerRef.current = setTimeout(() => {
          cosmographRef.current?.start(1);
          clusterStartTimerRef.current = null;
        }, 100);

        clusterTimerRef.current = setTimeout(() => {
          setCanvasOverride({
            ...FREEZE_FLAGS,
            simulationCluster: 0.1,
            simulationGravity: BASE_CONFIG.simulationGravity,
          });
          clusterTimerRef.current = null;
        }, DECLUSTER_ANIMATE_MS);
      }
    },
    [prepResult],
  );

  // Cleanup cluster timers on unmount
  useEffect(() => {
    return () => {
      if (clusterTimerRef.current !== null) {
        clearTimeout(clusterTimerRef.current);
      }
      if (clusterStartTimerRef.current !== null) {
        clearTimeout(clusterStartTimerRef.current);
      }
    };
  }, []);

  // Belief clustering follows the viewed round: each rendered round
  // re-assigns clusters (liveBeliefLabel identity change) and this gentle
  // reheat gives the simulation enough energy to pull migrating nodes to
  // their new group. It cools down by itself once rounds stop changing.
  useEffect(() => {
    if (clusterMode !== "belief" || frame === null) return;
    cosmographRef.current?.start(0.12);
  }, [clusterMode, frame]);

  // Auto-advancing rounds suspend clustering entirely (user decision): belief
  // reassignment per frame is what lags, and the static modes are suspended
  // too for a uniform rule. Manual stepping keeps them — the migration
  // animation runs at the user's own pace.
  useEffect(() => {
    if (playbackActive && clusterMode !== null) {
      handleClusterMode(null);
    }
  }, [playbackActive, clusterMode, handleClusterMode]);

  // Let the page know whether grouping is active (it delays play so the
  // de-cluster animation runs before rounds start advancing).
  useEffect(() => {
    onClusterActiveChange?.(clusterMode !== null);
  }, [clusterMode, onClusterActiveChange]);

  // ─── Node selection greyout ───────────────────────────────────────────────
  // Tell Cosmograph which point is selected so it dims everything else.
  // Works regardless of link visibility.
  useEffect(() => {
    if (selectedAgentIndex === null) {
      cosmographRef.current?.selectPoint(undefined);
      return;
    }
    const cosmographIndex = agentIndexMapRef.current.indexOf(selectedAgentIndex);
    if (cosmographIndex === -1) return;
    cosmographRef.current?.selectPoint(cosmographIndex, false, false);
  }, [selectedAgentIndex]);

  // ─── Zoom controls (mockup: − / ＋ / ajustar a pantalla) ───────────────────
  const zoomBy = useCallback((factor: number) => {
    const current = cosmographRef.current?.getZoomLevel();
    if (current === undefined) return;
    cosmographRef.current?.setZoomLevel(current * factor, 150);
  }, []);

  // ─── Render helpers ────────────────────────────────────────────────────────

  // Non-running status branches — rendered when topology isn't the concern.
  // Guard is gated on prepResult === null so that a mid-run WS reconnect
  // (which transiently sets status="connecting") does not unmount Cosmograph
  // and force a full GPU re-upload. Once the graph is initialized, reconnection
  // should be transparent to the canvas.
  if (status === "connecting" && prepResult === null) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <p className="font-sans text-sm text-muted-foreground">
          {t("simulation.statusConnecting")}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <p className="font-sans text-sm text-destructive">{t("simulation.errorStream")}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/board">{t("simulation.backToBoard")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // A cancelled run keeps its received data on screen (mockup: "los datos
  // recibidos se conservan") — only fall back to the message when the graph
  // never initialized.
  if (status === "cancelled" && prepResult === null) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <p className="font-sans text-sm text-muted-foreground">
            {t("simulation.statusCancelled")}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/board">{t("simulation.backToBoard")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "completed" && !topology) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <p className="font-sans text-base font-medium text-foreground">
            {t("simulation.simulationComplete")}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/board">{t("simulation.backToBoard")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Canvas-phase rendering (idle / preparing / layouting / frozen / error)

  if (phase === "idle") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <p className="font-sans text-sm text-muted-foreground">{t("simulation.panelCosmograph")}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <p className="font-sans text-sm text-destructive">
            {t("simulation.canvas.dataPrepError")}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/board">{t("simulation.backToBoard")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "preparing") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
        <p className="font-sans text-sm text-muted-foreground animate-pulse">
          {t("simulation.canvas.preparingData")}
        </p>
      </div>
    );
  }

  // phase === "layouting" or "frozen" — Cosmograph is mounted
  // Guard: prepResult must be resolved before mounting (avoids StrictMode
  // DuckDB catalog corruption discovered in the F3 spike).
  if (!prepResult?.points) return null;

  return (
    <div className="relative h-full w-full">
      {/* Cosmograph canvas — full bleed.
          Spread order: prepResult.cosmographConfig (column names from prepareCosmographData),
          then BASE_CONFIG (visual defaults), then canvasOverride (freeze / cluster flags).
          canvasOverride is the only source of enableSimulation=false and cluster props —
          never set imperatively via ref.setConfig to avoid the "no points" validation error. */}
      <Cosmograph
        ref={cosmographRef}
        style={canvasStyle}
        {...prepResult.cosmographConfig}
        {...BASE_CONFIG}
        {...canvasOverride}
        {...(clusterMode !== null && {
          pointClusterByFn:
            clusterMode === "strategy"
              ? silenceStrategyLabel
              : clusterMode === "effect"
                ? silenceEffectLabel
                : liveBeliefLabel,
        })}
        // "Colorear por" (#99 repaint mechanism): per-agent color from the
        // VIEWED frame by index — the store's latestFrame changes on every
        // seek/live round and this closure re-reads it. Without a frame the
        // fns fall back to initial beliefs; strategy coloring needs no frame.
        // Setting the strategies to undefined activates the *ByFn overrides.
        {...((frame !== null || colorBy === "estr") && {
          pointColorBy: "agentIndex",
          pointColorStrategy: undefined,
          pointColorByFn: colorByFn,
        })}
        // Speaking agents render larger — meaningful once a round is on screen
        {...(frame !== null && {
          pointSizeBy: "agentIndex",
          pointSizeStrategy: undefined,
          pointSizeByFn: speakingSizeByFn,
        })}
        // Hide links by making them transparent — keeps renderLinks=true so
        // Cosmograph's node selection greyout still works normally.
        {...(linksHidden && { linkDefaultColor: "rgba(204,204,204,0)" })}
        points={prepResult.points}
        links={prepResult.links}
        onClick={(index) => {
          if (index !== undefined) {
            const agentIdx = agentIndexMapRef.current[index];
            if (agentIdx !== undefined) setSelectedAgentIndex(agentIdx);
          } else {
            setSelectedAgentIndex(null);
          }
        }}
      />

      {/* "Computing layout…" overlay — shown only during force-layout phase */}
      {phase === "layouting" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <p className="font-sans text-sm text-muted-foreground animate-pulse">
            {t("simulation.canvas.computingLayout")}
          </p>
        </div>
      )}

      {/* "Agrupar" segmented — top-left */}
      <ClusterToggle
        activeMode={clusterMode}
        onChange={handleClusterMode}
        disabled={phase !== "frozen"}
        suspended={playbackActive}
      />

      {/* "Colorear por" select — top-right */}
      <ColorBySelect value={colorBy} onChange={setColorBy} />

      {/* Legend — bottom-right */}
      <CanvasLegend
        colorBy={colorBy}
        strategyLegend={strategyLegendEntries}
        showSpeakingLegend={frame !== null && currentRound > 0}
      />

      {/* Links toggle + zoom group — bottom-left (mockup) */}
      <div className="absolute bottom-2.5 left-2.5 z-10 flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLinksHidden((prev) => !prev)}
          className="h-7 rounded-lg bg-card px-3 text-xs font-medium shadow-sm"
        >
          {linksHidden ? t("simulation.canvas.showLinks") : t("simulation.canvas.hideLinks")}
        </Button>
        <span className="flex gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("runView.zoomOutAria")}
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("runView.zoomInAria")}
            onClick={() => zoomBy(1.25)}
          >
            <Plus />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("runView.zoomFitTip")}
                onClick={() => cosmographRef.current?.fitView(250)}
              >
                <Maximize />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("runView.zoomFitTip")}</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}
