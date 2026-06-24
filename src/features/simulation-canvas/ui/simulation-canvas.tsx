import type {
  CosmographConfig,
  CosmographData,
  CosmographDataPrepResult,
  CosmographRef,
} from "@cosmograph/react";
import { Cosmograph, prepareCosmographData } from "@cosmograph/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SimulationStatus } from "@/entities/simulation";
import { useSimulationStore } from "@/entities/simulation";
import type { TopologyResponse } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { interpolateOpinion, OPINION_PALETTE } from "@/shared/lib/opinion-palette";
import { Button } from "@/shared/ui/button";
import { topologyToData } from "../lib/topology-to-data";
import { CanvasLegend } from "./canvas-legend";
import type { ClusterMode } from "./cluster-toggle";
import { ClusterToggle } from "./cluster-toggle";
import type { CanvasView } from "./view-toggle";
import { ViewToggle } from "./view-toggle";

// ─── Types ────────────────────────────────────────────────────────────────────

type CanvasPhase = "idle" | "preparing" | "layouting" | "frozen" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration (ms) the force-directed layout runs before freezing. */
const LAYOUT_DURATION_MS = 5_000;

/** Duration (ms) the clustering re-run executes before re-freezing. */
const CLUSTER_REANIMATE_MS = 4_000;

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
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SimulationCanvas({ status, topology }: SimulationCanvasProps) {
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
  // The merged final frame — populated by the live stream during the run and,
  // for cold-loaded completed runs, by the REST replay fallback in
  // use-simulation-stream.ts. Drives the Final view's per-agent color/size (#99).
  const latestFrame = useSimulationStore((s) => s.latestFrame);
  // Maps Cosmograph's sequential internal index → agent.index from topology.
  // Rebuilt each time topology is processed (same useEffect below).
  const agentIndexMapRef = useRef<number[]>([]);

  // ─── Initial / Final view toggle (#99) ────────────────────────────────────
  const [viewMode, setViewMode] = useState<CanvasView>("initial");
  // Final is available once the run has converged and the final frame is in the
  // store for THIS network (guards against a stale frame from a previous run).
  const finalAvailable =
    status === "completed" && latestFrame !== null && latestFrame.networkId === topology?.networkId;
  // One-shot auto-switch to Final when it first becomes available, unless the
  // researcher already picked a view manually (don't yank them away mid-look).
  const autoSelectedRef = useRef(false);
  const userTouchedRef = useRef(false);

  const handleViewChange = useCallback((next: CanvasView) => {
    userTouchedRef.current = true;
    setViewMode(next);
  }, []);

  // Reads the final frame by the `agentIndex` column value (Cosmograph passes
  // the column value reliably; the optional 2nd `index` arg is not dependable).
  const finalColorByFn = useCallback(
    (value: unknown): string => {
      const agentIdx = Number(value);
      if (latestFrame === null || !Number.isFinite(agentIdx)) return OPINION_PALETTE[1];
      const belief = latestFrame.publicBelief[agentIdx];
      return belief === undefined ? OPINION_PALETTE[1] : interpolateOpinion(belief);
    },
    [latestFrame],
  );

  const finalSizeByFn = useCallback(
    (value: unknown): number => {
      const agentIdx = Number(value);
      if (latestFrame === null || !Number.isFinite(agentIdx)) return 8;
      return latestFrame.speaking[agentIdx] ? 14 : 8;
    },
    [latestFrame],
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
      setViewMode("initial");
      autoSelectedRef.current = false;
      userTouchedRef.current = false;
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

  // ─── Cluster mode handler ─────────────────────────────────────────────────

  const handleClusterMode = useCallback(
    (mode: ClusterMode) => {
      if (prepResult === null) return;

      const next = clusterMode === mode ? null : mode;
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
        const pointClusterBy = next === "strategy" ? "silenceStrategy" : "initialBelief";
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

        clusterTimerRef.current = setTimeout(() => {
          setCanvasOverride({
            ...FREEZE_FLAGS,
            pointClusterBy,
            showClusterLabels: true,
          });
          clusterTimerRef.current = null;
        }, CLUSTER_REANIMATE_MS);
      } else {
        setCanvasOverride({
          ...FREEZE_FLAGS,
          simulationCluster: 0.1,
          simulationGravity: BASE_CONFIG.simulationGravity,
        });
      }
    },
    [clusterMode, prepResult],
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

  // ─── Auto-select Final view once it becomes available ──────────────────────
  // Fires for both cold-loaded completed runs and a live run reaching
  // convergence, but only if the researcher hasn't already chosen a view.
  // Gated on `frozen` so the heavy first render (force-layout warmup) always
  // happens in the cheap Initial view — never with the per-point Final closure
  // running on an unstable, still-simulating graph.
  useEffect(() => {
    if (
      phase === "frozen" &&
      finalAvailable &&
      !autoSelectedRef.current &&
      !userTouchedRef.current
    ) {
      autoSelectedRef.current = true;
      setViewMode("final");
    }
  }, [phase, finalAvailable]);

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

  if (status === "cancelled") {
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
          pointClusterByFn: clusterMode === "strategy" ? silenceStrategyLabel : beliefLabel,
        })}
        // Final view (#99): swap the static initialBelief coloring for per-agent
        // final publicBelief + speaking, read from the merged frame by index.
        // Setting the strategies to undefined activates the *ByFn overrides.
        // One-shot config change (not per-tick) — orthogonal to cluster/freeze.
        {...(viewMode === "final" && {
          pointColorBy: "agentIndex",
          pointColorStrategy: undefined,
          pointColorByFn: finalColorByFn,
          pointSizeBy: "agentIndex",
          pointSizeStrategy: undefined,
          pointSizeByFn: finalSizeByFn,
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

      {/* Cluster toggle — top-left */}
      <ClusterToggle
        activeMode={clusterMode}
        onToggle={handleClusterMode}
        disabled={phase !== "frozen"}
      />

      {/* Initial / Final view toggle — top-right */}
      <ViewToggle view={viewMode} onChange={handleViewChange} finalEnabled={finalAvailable} />

      {/* Belief / size legend — bottom-right */}
      <CanvasLegend view={viewMode} />

      {/* Hide-links toggle — bottom-left, same pill style as cluster buttons */}
      <div className="absolute bottom-2 left-2 z-10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLinksHidden((prev) => !prev)}
          className={`
            rounded-full px-3 py-1.5 text-xs font-medium transition-colors
            ${linksHidden ? "bg-primary/10 border-primary/30 text-primary" : ""}
          `}
        >
          {linksHidden ? t("simulation.canvas.showLinks") : t("simulation.canvas.hideLinks")}
        </Button>
      </div>
    </div>
  );
}
