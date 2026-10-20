import { useEffect, useMemo, useState } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useFrameCoalesced } from "@/shared/lib/frame-coalescer";
import {
  type FineHistogramPool,
  type PolarizationSeries,
  type SeriesSpec,
  seriesCacheFor,
  seriesKey,
} from "@/shared/lib/polarization";

/** Time budget per animation frame for computing new rounds (keeps long runs responsive). */
const FRAME_BUDGET_MS = 8;

interface Inputs {
  version: number;
  pool: FineHistogramPool | null;
  currentRound: number;
}

const subscribeAggregates = (listener: () => void) => useRoundAggregatesStore.subscribe(listener);
const subscribeSimulation = (listener: () => void) => useSimulationStore.subscribe(listener);
const SUBSCRIBES = [subscribeAggregates, subscribeSimulation] as const;

function readInputs(): Inputs {
  const aggregates = useRoundAggregatesStore.getState();
  return {
    version: aggregates.version,
    pool: aggregates.fineHistograms,
    currentRound: useSimulationStore.getState().currentRound,
  };
}

export interface PolarizationSeriesState {
  series: PolarizationSeries | null;
  /** Changes whenever the series gains values (re-render signal). */
  seriesVersion: number;
  currentRound: number;
}

/**
 * The memoized series for (measure, params, k, belief) over the run's fine histograms. New rounds
 * are computed incrementally — at most once per animation frame (coalesced store updates), within
 * a time budget, continuing on the next frame when a long run is still being caught up.
 */
export function usePolarizationSeries(spec: SeriesSpec): PolarizationSeriesState {
  const { version, pool, currentRound } = useFrameCoalesced(SUBSCRIBES, readInputs);
  const key = seriesKey(spec);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the spec
  const series = useMemo(
    () => (pool === null ? null : seriesCacheFor(pool).get(spec)),
    [pool, key],
  );
  const [seriesVersion, setSeriesVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version signals new rounds in the pool
  useEffect(() => {
    if (series === null || pool === null) return;
    let handle: number | null = null;
    const step = () => {
      handle = null;
      const { done, changed } = series.update(pool, FRAME_BUDGET_MS);
      if (changed) setSeriesVersion((v) => v + 1);
      if (!done) handle = requestAnimationFrame(step);
    };
    step();
    return () => {
      if (handle !== null) cancelAnimationFrame(handle);
    };
  }, [series, pool, version]);

  return { series, seriesVersion, currentRound };
}
