import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real stores; the entity index (Firebase-touching ws module) stays out.
vi.mock("@/entities/simulation", async () => ({
  useSimulationStore: (
    await vi.importActual<typeof import("../../../entities/simulation/model/simulation.store")>(
      "../../../entities/simulation/model/simulation.store",
    )
  ).useSimulationStore,
  useRoundAggregatesStore: (
    await vi.importActual<
      typeof import("../../../entities/simulation/model/round-aggregates.store")
    >("../../../entities/simulation/model/round-aggregates.store")
  ).useRoundAggregatesStore,
}));

import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { createMeasure } from "@/shared/lib/polarization";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { effectiveParams, usePolarizationSettingsStore } from "./polarization-settings.store";
import { usePolarizationSeries } from "./use-polarization-series";

const KEY = "run-1|net-1";

function frame(round: number, privateBelief: number[]): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(privateBelief.map(() => 0.5)),
    privateBelief: new Float32Array(privateBelief),
    speaking: new Uint8Array(privateBelief.length),
  };
}

describe("usePolarizationSettingsStore", () => {
  beforeEach(() => {
    usePolarizationSettingsStore.setState({
      measureId: "EstebanRay",
      paramsByMeasure: {},
      k: 5,
      belief: "private",
    });
  });

  it("defaults to Esteban–Ray, k = 5 and private beliefs", () => {
    const state = usePolarizationSettingsStore.getState();
    expect([state.measureId, state.k, state.belief]).toEqual(["EstebanRay", 5, "private"]);
    expect(effectiveParams(state.paramsByMeasure, "EstebanRay")).toEqual({ alpha: 0.8, K: null });
  });

  it("remembers parameters per measure and restores defaults", () => {
    const store = usePolarizationSettingsStore.getState();
    store.setParams("MEC", { alpha: 1 });
    store.setParams("MEC", { beta: 2 });
    store.setMeasure("BiPol");
    store.setK(7);
    store.setBelief("public");
    let state = usePolarizationSettingsStore.getState();
    expect(effectiveParams(state.paramsByMeasure, "MEC")).toEqual({ alpha: 1, beta: 2 });
    expect([state.measureId, state.k, state.belief]).toEqual(["BiPol", 7, "public"]);
    state.resetParams("MEC");
    state = usePolarizationSettingsStore.getState();
    expect(state.paramsByMeasure.MEC).toBeUndefined();
    expect(effectiveParams(state.paramsByMeasure, "MEC")).toEqual({ alpha: 2, beta: 1.15 });
  });
});

describe("usePolarizationSeries", () => {
  let frames: FrameRequestCallback[] = [];
  const flushFrames = () => {
    const pending = frames;
    frames = [];
    for (const cb of pending) cb(0);
  };

  beforeEach(() => {
    frames = [];
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("computes new rounds from the aggregates' fine histograms as they arrive", () => {
    const spec = { measureId: "BiPol" as const, params: {}, k: 5, belief: "private" as const };
    const { result } = renderHook(() => usePolarizationSeries(spec));
    act(() => flushFrames());

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 0, 1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, frame(1, [0.5, 0.5, 0.5, 0.5]));
    });
    act(() => flushFrames());
    act(() => flushFrames());

    const series = result.current.series;
    expect(series).not.toBeNull();
    expect(series?.valueAt(0)).toBe(
      createMeasure("BiPol").call([0, 0.25, 0.5, 0.75, 1], [0.5, 0, 0, 0, 0.5]),
    );
    expect(series?.valueAt(1)).toBe(0);
    expect(result.current.seriesVersion).toBeGreaterThan(0);
  });

  it("follows the viewed round and returns the memoized series for the same spec", () => {
    useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0.1, 0.9]));
    const spec = {
      measureId: "MEC" as const,
      params: { alpha: 2, beta: 1.15 },
      k: 3,
      belief: "private" as const,
    };
    const first = renderHook(() => usePolarizationSeries(spec));
    act(() => flushFrames());
    const second = renderHook(() => usePolarizationSeries({ ...spec, params: { ...spec.params } }));
    act(() => flushFrames());
    expect(second.result.current.series).toBe(first.result.current.series);

    act(() => {
      useSimulationStore.getState().updateFrame(frame(0, [0.1, 0.9]));
    });
    act(() => flushFrames());
    expect(first.result.current.currentRound).toBe(0);
    first.unmount();
    second.unmount();
  });
});

describe("round-aggregates store (polarization hook)", () => {
  beforeEach(() => useRoundAggregatesStore.getState().reset());

  it("records the fine histograms of every ingested round and resets them per key", () => {
    useRoundAggregatesStore.getState().ingest(KEY, frame(3, [0, 0.5, 1]));
    const pool = useRoundAggregatesStore.getState().fineHistograms;
    expect(pool?.has(3)).toBe(true);
    expect(pool?.fine(3, "private")?.[105]).toBe(1);
    expect(pool?.fine(3, "public")?.[105]).toBe(3);

    useRoundAggregatesStore.getState().ingest("run-2|net-1", frame(0, [0.2]));
    const next = useRoundAggregatesStore.getState().fineHistograms;
    expect(next).not.toBe(pool);
    expect(next?.has(3)).toBe(false);
    expect(useRoundAggregatesStore.getState().aggregates[0]?.variancePrivate).toBe(0);
  });
});
