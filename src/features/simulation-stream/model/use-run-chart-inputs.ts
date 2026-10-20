import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useFrameCoalesced } from "@/shared/lib/frame-coalescer";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export interface RunChartInputs {
  /** Round-aggregates buffer version (mutable buffers are read via getState()). */
  version: number;
  maxRound: number;
  latestFrame: MergedFrame | null;
  currentRound: number;
}

const subscribeAggregates = (listener: () => void) => useRoundAggregatesStore.subscribe(listener);
const subscribeSimulation = (listener: () => void) => useSimulationStore.subscribe(listener);
const SUBSCRIBES = [subscribeAggregates, subscribeSimulation] as const;

function readInputs(): RunChartInputs {
  const aggregates = useRoundAggregatesStore.getState();
  const simulation = useSimulationStore.getState();
  return {
    version: aggregates.version,
    maxRound: aggregates.maxRound,
    latestFrame: simulation.latestFrame,
    currentRound: simulation.currentRound,
  };
}

/**
 * What the run charts redraw from, coalesced to at most one update per animation frame (#129):
 * during live ingest every round bumps the aggregates and the viewed frame, but the charts
 * repaint once per frame with the latest of both.
 */
export function useRunChartInputs(): RunChartInputs {
  return useFrameCoalesced(SUBSCRIBES, readInputs);
}
