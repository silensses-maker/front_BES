import { beforeEach, describe, expect, it } from "vitest";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useRoundAggregatesStore } from "./round-aggregates.store";

const KEY = "run-1|net-1";

function makeFrame(round: number, publicBelief: number[] = [0.2, 0.8]): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(publicBelief),
    privateBelief: new Float32Array(publicBelief.map((v) => 1 - v)),
    speaking: new Uint8Array(publicBelief.map(() => 1)),
  };
}

describe("useRoundAggregatesStore", () => {
  beforeEach(() => {
    useRoundAggregatesStore.getState().reset();
  });

  it("ingests a frame: aggregate stored at its round, version bumped", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(4));
    const state = useRoundAggregatesStore.getState();
    expect(state.key).toBe(KEY);
    expect(state.version).toBe(1);
    expect(state.maxRound).toBe(4);
    expect(state.aggregates[4]?.meanPublic).toBeCloseTo(0.5, 5);
    expect(state.aggregates[3]).toBeUndefined();
  });

  it("is idempotent per round (re-ingesting does not bump version)", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(2));
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(2, [0.9, 0.9]));
    const state = useRoundAggregatesStore.getState();
    expect(state.version).toBe(1);
    expect(state.aggregates[2]?.meanPublic).toBeCloseTo(0.5, 5);
  });

  it("accepts out-of-order rounds without regressing maxRound", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(10));
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(3));
    const state = useRoundAggregatesStore.getState();
    expect(state.maxRound).toBe(10);
    expect(state.aggregates[3]).toBeDefined();
    expect(state.version).toBe(2);
  });

  it("initializes sampled indices from the first frame and appends series points", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(0, [0.1, 0.5, 0.9]));
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(1, [0.2, 0.5, 0.8]));
    const state = useRoundAggregatesStore.getState();
    expect(state.sampledIndices).toEqual([0, 1, 2]);
    expect(state.series.get(0)).toHaveLength(2);
    expect(state.series.get(2)?.[0]?.[1]).toBeCloseTo(0.9, 5);
  });

  it("resets buffers when the key changes", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(5));
    useRoundAggregatesStore.getState().ingest("run-2|net-9", makeFrame(0));
    const state = useRoundAggregatesStore.getState();
    expect(state.key).toBe("run-2|net-9");
    expect(state.maxRound).toBe(0);
    expect(state.aggregates[5]).toBeUndefined();
    expect(state.sweepDone).toBe(false);
  });

  it("setSweepDone marks completion only for the current key", () => {
    useRoundAggregatesStore.getState().ingest(KEY, makeFrame(0));
    useRoundAggregatesStore.getState().setSweepDone("stale-key");
    expect(useRoundAggregatesStore.getState().sweepDone).toBe(false);
    useRoundAggregatesStore.getState().setSweepDone(KEY);
    expect(useRoundAggregatesStore.getState().sweepDone).toBe(true);
  });
});
