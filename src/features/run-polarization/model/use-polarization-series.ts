import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useFrameCoalesced } from "@/shared/lib/frame-coalescer";
import type { FineHistogramPool } from "@/shared/lib/polarization";
import { type PolarizationSeries, seriesCacheFor } from "./polarization-series";
import { debounceEntries, entriesKey, nextToSync, type SpecEntry } from "./series-scheduler";

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
 * `current`, but a series whose spec CHANGED keeps its previous spec until the entries have been
 * stable for SPEC_DEBOUNCE_MS (see `debounceEntries`: new and removed series, and a spec appearing
 * or going away, apply at once).
 */
function useDebouncedEntries(current: readonly SpecEntry[]): SpecEntry[] {
  const currentKey = entriesKey(current);
  const [applied, setApplied] = useState<readonly SpecEntry[]>(current);
  const merged = debounceEntries(applied, current);
  const mergedKey = entriesKey(merged.entries);
  const appliedKey = entriesKey(applied);

  // What applies at once is recorded, so the next change is compared with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the keys identify the entries
  useEffect(() => {
    if (mergedKey !== appliedKey) setApplied(merged.entries);
  }, [mergedKey, appliedKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the entries
  useEffect(() => {
    if (!merged.pending) return;
    const timer = setTimeout(() => setApplied(current), SPEC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [currentKey, merged.pending]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the entries
  return useMemo(() => merged.entries, [mergedKey]);
}

/** The distinct series of a list (equal specs share one cached series). */
function distinct(series: ReadonlyArray<PolarizationSeries | null>): PolarizationSeries[] {
  const out: PolarizationSeries[] = [];
  for (const item of series) {
    if (item !== null && !out.includes(item)) out.push(item);
  }
  return out;
}

export interface PolarizationSeriesListState {
  /** One per entry, in order (null = no spec, or no histograms yet). */
  series: Array<PolarizationSeries | null>;
  /** Changes whenever one of the series changes (re-render signal). */
  seriesVersion: number;
  currentRound: number;
  /** Rounds whose histograms are recorded (what the series can be computed over so far). */
  recorded: number;
  /** Clears the error of the series at `index` and requests again. */
  retry: (index: number) => void;
}

/**
 * The server-computed series of the compared specs over the run's fine histograms. Each series
 * is the cached per-spec model (PolarizationSeries: chunked, incremental, throttled while live);
 * this hook shares the server between them (see series-scheduler.ts: one request in flight at a
 * time, round-robin among the series that may send). A changed spec is debounced per series;
 * series are cached per run / network, so going back to a spec, or a copy of a series, costs no
 * request. A failing series stops on its own (`retry`) and does not hold the others back.
 */
export function usePolarizationSeriesList(
  entries: readonly SpecEntry[],
): PolarizationSeriesListState {
  const { version, pool, currentRound } = useFrameCoalesced(SUBSCRIBES, readInputs);
  const debounced = useDebouncedEntries(entries);
  const key = entriesKey(debounced);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key identifies the entries
  const series = useMemo(
    () =>
      debounced.map(({ spec }) =>
        pool === null || spec === null ? null : seriesCacheFor(pool).get(spec),
      ),
    [pool, key],
  );
  const [seriesVersion, setSeriesVersion] = useState(0);
  const [retries, setRetries] = useState(0);
  /** Key of the series served last (round-robin across effect runs). */
  const lastServed = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version (new rounds) and retries re-run it
  useEffect(() => {
    if (pool === null) return;
    const active = distinct(series);
    if (active.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      if (!cancelled) setSeriesVersion(active.reduce((sum, item) => sum + item.version, 0));
    };
    const tick = () => {
      timer = null;
      if (cancelled) return;
      const pending = active.find((item) => item.pending !== null)?.pending ?? null;
      if (pending !== null) {
        void pending.then(() => {
          changed();
          tick();
        });
        return;
      }
      const now = performance.now();
      const next = nextToSync(
        active.map((item) => ({ key: item.key, delay: item.nextSyncDelay(pool, now) })),
        lastServed.current,
      );
      if (next === null) {
        changed();
        return;
      }
      if (next.delay > 0) {
        timer = setTimeout(tick, next.delay);
        return;
      }
      const target = active[next.index] as PolarizationSeries;
      lastServed.current = target.key;
      const request = target.sync(pool);
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

  const retry = useCallback(
    (index: number) => {
      series[index]?.retry();
      setRetries((n) => n + 1);
    },
    [series],
  );

  return { series, seriesVersion, currentRound, recorded: pool?.size ?? 0, retry };
}
