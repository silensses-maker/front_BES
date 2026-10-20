import type { CosmographConfig, CosmographRef } from "@cosmograph/react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { TopologyResponse } from "@/shared/api/backend";
import {
  type BenchCanvasOverlay,
  type BenchClusterMode,
  benchProbe,
  registerBenchCanvas,
} from "@/shared/lib/bench-probe";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import {
  attachCosmographProbe,
  type CosmographProbe,
  readCosmographRenderer,
} from "./bench-cosmograph-probe";

interface BenchCanvasProbeInput {
  phase: string;
  topology: TopologyResponse | null;
  cosmographRef: RefObject<CosmographRef>;
  setClusterMode: (mode: BenchClusterMode | null) => void;
  /** The viewed frame (null before the first round renders). */
  frame: MergedFrame | null;
  /** The canvas' own "hide links" state. */
  setLinksHidden: (hidden: boolean) => void;
  /** The canvas' own config overlay state. */
  setCanvasOverride: Dispatch<SetStateAction<CosmographConfig>>;
}

/**
 * Benchmark builds only (#126). SimulationCanvas calls this hook inside
 * `if (__BENCHMARK__) { … }`: the condition is a build-time literal, so the call is either made on
 * every render (bench builds) or compiled out (normal builds) — the hook order never changes.
 *
 * - Emits `canvas-layout-start` / `canvas-frozen` / `canvas-error` when the canvas COMMITS those
 *   phases, once per actual phase change.
 * - Forwards Cosmograph's own lifecycle events (data rebuilt, first simulation tick…) and times
 *   its setConfig calls (see bench-cosmograph-probe.ts).
 * - Emits `canvas-frame-commit` when a new viewed frame is committed (repaint breakdown).
 * - Exposes the Cosmograph instance, the "Agrupar" entry point and the canvas variants to the
 *   harness. Variants go through the canvas' own state, never through Cosmograph directly.
 */
export function useBenchCanvasProbe({
  phase,
  topology,
  cosmographRef,
  setClusterMode,
  frame,
  setLinksHidden,
  setCanvasOverride,
}: BenchCanvasProbeInput): void {
  const previousPhase = useRef<string | null>(null);
  const probe = useRef<CosmographProbe | null>(null);

  useEffect(() => {
    // A topology swap re-renders once with the old phase before the canvas resets it — only an
    // actual phase change is an event.
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    if (topology === null) return;
    const detail = {
      runId: topology.runId,
      networkId: topology.networkId,
      agents: topology.agents.length,
      edges: topology.edges.length,
    };
    if (phase === "layouting") benchProbe("canvas-layout-start", detail);
    else if (phase === "frozen") benchProbe("canvas-frozen", detail);
    else if (phase === "error") benchProbe("canvas-error", detail);
  }, [phase, topology]);

  // Cosmograph is mounted only in the layouting/frozen phases; its instance appears once the
  // wrapper re-rendered with it, so poll a few frames for it, then attach.
  const mounted = phase === "layouting" || phase === "frozen";
  useEffect(() => {
    if (!mounted || topology === null) return;
    const detail = { runId: topology.runId, networkId: topology.networkId };
    let attached: CosmographProbe | null = null;
    let handle = 0;
    const tryAttach = () => {
      const instance = cosmographRef.current;
      if (instance) {
        attached = attachCosmographProbe(instance, detail);
        probe.current = attached;
      } else handle = requestAnimationFrame(tryAttach);
    };
    tryAttach();
    return () => {
      cancelAnimationFrame(handle);
      attached?.detach();
      if (probe.current === attached) probe.current = null;
    };
  }, [mounted, topology, cosmographRef]);

  useLayoutEffect(() => {
    if (frame === null || topology === null) return;
    benchProbe("canvas-frame-commit", { networkId: topology.networkId, round: frame.round });
  }, [frame, topology]);

  const setOverlay = useCallback(
    (overlay: BenchCanvasOverlay) => {
      setLinksHidden(overlay === "links-transparent");
      setCanvasOverride((prev) => {
        const next = { ...prev };
        delete next.renderLinks;
        delete next.curvedLinks;
        if (overlay === "links-off") next.renderLinks = false;
        if (overlay === "straight-links") next.curvedLinks = false;
        return next;
      });
    },
    [setLinksHidden, setCanvasOverride],
  );

  useEffect(
    () =>
      registerBenchCanvas({
        networkId: topology?.networkId ?? null,
        getCosmograph: () => cosmographRef.current,
        setClusterMode,
        setOverlay,
        getRenderer: () => readCosmographRenderer(cosmographRef.current),
        pendingUpdates: () => probe.current?.pending() ?? 0,
      }),
    [topology, cosmographRef, setClusterMode, setOverlay],
  );
}
