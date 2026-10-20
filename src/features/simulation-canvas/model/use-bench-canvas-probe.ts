import type { CosmographRef } from "@cosmograph/react";
import { type RefObject, useEffect, useRef } from "react";
import type { TopologyResponse } from "@/shared/api/backend";
import { type BenchClusterMode, benchProbe, registerBenchCanvas } from "@/shared/lib/bench-probe";

interface BenchCanvasProbeInput {
  phase: string;
  topology: TopologyResponse | null;
  cosmographRef: RefObject<CosmographRef>;
  setClusterMode: (mode: BenchClusterMode | null) => void;
}

/**
 * Benchmark builds only (#126). SimulationCanvas calls this hook inside
 * `if (__BENCHMARK__) { … }`: the condition is a build-time literal, so the call is either made on
 * every render (bench builds) or compiled out (normal builds) — the hook order never changes.
 *
 * - Emits `canvas-layout-start` / `canvas-frozen` / `canvas-error` when the canvas COMMITS those
 *   phases (Cosmograph mounted / force layout stopped), once per actual phase change.
 * - Exposes the Cosmograph instance and the "Agrupar" entry point to the harness.
 */
export function useBenchCanvasProbe({
  phase,
  topology,
  cosmographRef,
  setClusterMode,
}: BenchCanvasProbeInput): void {
  const previousPhase = useRef<string | null>(null);

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

  useEffect(
    () =>
      registerBenchCanvas({
        networkId: topology?.networkId ?? null,
        getCosmograph: () => cosmographRef.current,
        setClusterMode,
      }),
    [topology, cosmographRef, setClusterMode],
  );
}
