import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useFrameCoalesced } from "@/shared/lib/frame-coalescer";
import type { FineHistogramPool } from "@/shared/lib/polarization";
import {
  type PolarizationSeries,
  type SeriesSpec,
  seriesCacheFor,
  seriesKey,
} from "./polarization-series";

/** Parameter edits wait this long before a new series is requested (typing α 1 → 1.2 → 1.25). */
export const SPEC_DEBOUNCE_MS = 300;

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

/**
 * `spec`, but a CHANGED spec only once it has been stable for SPEC_DEBOUNCE_MS (the first spec,
 * and going back to none, apply at once).
 */
function useDebouncedSpec(spec: SeriesSpec | null): SeriesSpec | null {
  const key = spec === null ? null : seriesKey(spec);
  const [debounced, setDebounced] = useState(spec);
  const debouncedKey = debounced === null ? null : seriesKey(debounced);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the spec
  useEffect(() => {
    if (key === debouncedKey) return;
    if (key === null || debouncedKey === null) {
      setDebounced(spec);
      return;
    }
    const timer = setTimeout(() => setDebounced(spec), SPEC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, debouncedKey]);

  return debounced;
}

export interface PolarizationSeriesState {
  series: PolarizationSeries | null;
  /** Changes whenever the series changes (re-render signal). */
  seriesVersion: number;
  currentRound: number;
  /** Clears the series' error and requests again. */
  retry: () => void;
}

/**
 * The server-computed series for (measure, params, k, belief) over the run's fine histograms
 * (`spec` null = none, e.g. while the catalog loads). New rounds are sent incrementally as they
 * arrive (see PolarizationSeries for the chunking and the live interval); a changed spec is
 * debounced; series are cached per run / network, so going back to a spec costs no request.
 */
export function usePolarizationSeries(spec: SeriesSpec | null): PolarizationSeriesState {
  const { version, pool, currentRound } = useFrameCoalesced(SUBSCRIBES, readInputs);
  const debounced = useDebouncedSpec(spec);
  const key = debounced === null ? null : seriesKey(debounced);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the spec
  const series = useMemo(
    () => (pool === null || debounced === null ? null : seriesCacheFor(pool).get(debounced)),
    [pool, key],
  );
  const [seriesVersion, setSeriesVersion] = useState(0);
  const [retries, setRetries] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version (new rounds) and retries re-run it
  useEffect(() => {
    if (series === null || pool === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      if (!cancelled) setSeriesVersion(series.version);
    };
    const tick = () => {
      timer = null;
      if (cancelled) return;
      const pending = series.pending;
      if (pending !== null) {
        void pending.then(() => {
          changed();
          tick();
        });
        return;
      }
      const delay = series.nextSyncDelay(pool, performance.now());
      if (delay === null) {
        changed();
        return;
      }
      if (delay > 0) {
        timer = setTimeout(tick, delay);
        return;
      }
      const request = series.sync(pool);
      changed();
      void request.then(() => {
        changed();
        tick();
      });
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [series, pool, version, retries]);

  const retry = useCallback(() => {
    series?.retry();
    setRetries((n) => n + 1);
  }, [series]);

  return { series, seriesVersion, currentRound, retry };
}
