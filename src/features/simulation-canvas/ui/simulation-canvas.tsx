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
import type { TopologyResponse } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { OPINION_PALETTE } from "@/shared/lib/opinion-palette";
import { Button } from "@/shared/ui/button";
import { topologyToData } from "../lib/topology-to-data";
import type { ClusterMode } from "./cluster-toggle";
import { ClusterToggle } from "./cluster-toggle";

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
  linkColorStrategy: "single",
  linkDefaultColor: "#cccccc",
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

  const cosmographRef = useRef<CosmographRef>(undefined);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<CanvasPhase>("idle");
  const [prepResult, setPrepResult] = useState<CosmographDataPrepResult<CosmographData> | null>(
    null,
  );
  const [clusterMode, setClusterMode] = useState<ClusterMode | null>(null);

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
      return;
    }

    // Only prepare once per topology instance (object identity guard)
    let cancelled = false;
    setPhase("preparing");

    const run = async () => {
      try {
        const { rawPoints, rawLinks, dataPrepConfig } = topologyToData(topology);
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
  }, [topology]);

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
        setCanvasOverride({ ...FREEZE_FLAGS });
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
        points={prepResult.points}
        links={prepResult.links}
      />

      {/* "Computing layout…" overlay — shown only during force-layout phase */}
      {phase === "layouting" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <p className="font-sans text-sm text-muted-foreground animate-pulse">
            {t("simulation.canvas.computingLayout")}
          </p>
        </div>
      )}

      {/* Cluster toggle — interactive only when layout is frozen */}
      <ClusterToggle
        activeMode={clusterMode}
        onToggle={handleClusterMode}
        disabled={phase !== "frozen"}
      />
    </div>
  );
}
