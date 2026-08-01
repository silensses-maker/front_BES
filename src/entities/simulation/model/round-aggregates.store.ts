import { create } from "zustand";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import {
  computeRoundAggregate,
  MAX_SERIES_POINTS,
  type RoundAggregate,
  sampleAgentIndices,
  thinSeries,
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

    current.aggregates[frame.round] = computeRoundAggregate(frame);

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
