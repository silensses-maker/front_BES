import { create } from "zustand";
// polarization replica (#129): the histogram store only, not the barrel — the measures stay out
// of the initial chunk (this store is created at startup). Remove with src/shared/lib/polarization.
import { FineHistogramPool } from "@/shared/lib/polarization/fine-histograms";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import {
  MAX_SERIES_POINTS,
  type RoundAggregate,
  roundStatsOf,
  sampleAgentIndices,
  thinSeries,
  toRoundAggregate,
} from "../lib/round-aggregates";

/**
 * Per-round aggregates + sampled agent series for the run viewer (timeline
 * band, Rondas dataset, time charts, evolution chart).
 *
 * Buffers are MUTABLE and identity-stable: consumers subscribe to `version`
 * (bumped once per ingested round) and read the buffers via getState() inside
 * a memo. Ingestion is idempotent per round, so replay seeks or interleaved
 * WS/sweep sources can never corrupt accumulated data.
 *
 * Sources are the live stream (`receivedFrame` subscription) and the
 * cold-load sweep — both feed `ingest(key, frame)`; a key change (new
 * run/network) resets everything.
 */
interface RoundAggregatesState {
  /** `${runId}|${networkId}` the buffers belong to (null = empty). */
  key: string | null;
  /** Bumped on every newly ingested round — the reactive subscription target. */
  version: number;
  /** Highest round ingested so far (-1 when empty). */
  maxRound: number;
  /** True once the cold-load sweep has covered every round. */
  sweepDone: boolean;
  /** Sparse, indexed by round. Mutable — read via getState() keyed on version. */
  aggregates: Array<RoundAggregate | undefined>;
  /** Uniformly sampled agent indices for the evolution chart. */
  sampledIndices: number[];
  /** agentIndex → [round, publicBelief][] (append order, not guaranteed sorted). */
  series: Map<number, Array<[number, number]>>;
  /**
   * polarization replica (#129): 210-bin histograms per round and belief type (null when the
   * replica is compiled out). Mutable like the other buffers; a new pool per key.
   */
  fineHistograms: FineHistogramPool | null;

  ingest: (key: string, frame: MergedFrame) => void;
  setSweepDone: (key: string) => void;
  reset: () => void;
}

const emptyBuffers = () => ({
  version: 0,
  maxRound: -1,
  sweepDone: false,
  aggregates: [] as Array<RoundAggregate | undefined>,
  sampledIndices: [] as number[],
  series: new Map<number, Array<[number, number]>>(),
  // polarization replica (#129): remove with src/shared/lib/polarization + src/features/run-polarization
  fineHistograms: __POLARIZATION__ ? new FineHistogramPool() : null,
});

export const useRoundAggregatesStore = create<RoundAggregatesState>((set, get) => ({
  key: null,
  ...emptyBuffers(),

  ingest: (key, frame) => {
    const state = get();
    if (state.key !== key) {
      set({ key, ...emptyBuffers() });
    }
    const current = get();
    if (current.aggregates[frame.round] !== undefined) return; // idempotent

    const stats = roundStatsOf(frame);
    current.aggregates[frame.round] = toRoundAggregate(stats);
    // polarization replica (#129): remove with src/shared/lib/polarization + src/features/run-polarization
    if (__POLARIZATION__ && stats.fine !== null) {
      current.fineHistograms?.record(frame.round, stats.fine.public, stats.fine.private);
    }

    let sampled = current.sampledIndices;
    if (sampled.length === 0 && frame.publicBelief.length > 0) {
      sampled = sampleAgentIndices(frame.publicBelief.length);
    }
    for (const agentIdx of sampled) {
      let points = current.series.get(agentIdx);
      if (points === undefined) {
        points = [];
        current.series.set(agentIdx, points);
      }
      points.push([frame.round, frame.publicBelief[agentIdx] ?? 0]);
      if (points.length > MAX_SERIES_POINTS) {
        current.series.set(agentIdx, thinSeries(points));
      }
    }

    set({
      version: current.version + 1,
      maxRound: Math.max(current.maxRound, frame.round),
      sampledIndices: sampled,
    });
  },

  setSweepDone: (key) => {
    if (get().key !== key) return; // stale sweep from a previous network
    set({ sweepDone: true });
  },

  reset: () => set({ key: null, ...emptyBuffers() }),
}));
