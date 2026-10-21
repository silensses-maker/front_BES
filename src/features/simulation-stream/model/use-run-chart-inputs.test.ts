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
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useRunChartInputs } from "./use-run-chart-inputs";

function frame(round: number): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array([0.2, 0.8]),
    privateBelief: new Float32Array([0.3, 0.7]),
    speaking: new Uint8Array([1, 0]),
  };
}

describe("useRunChartInputs", () => {
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

  it("delivers a burst of live rounds as one update on the next frame", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useRunChartInputs();
    });
    act(() => flushFrames());
    const before = renders;

    act(() => {
      for (let round = 0; round < 5; round++) {
        useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(round));
        useSimulationStore.getState().ingestLiveFrame(frame(round));
      }
    });
    expect(result.current.version).toBe(0);
    act(() => flushFrames());

    expect(result.current.version).toBe(5);
    expect(result.current.maxRound).toBe(4);
    expect(result.current.currentRound).toBe(4);
    expect(result.current.latestFrame?.round).toBe(4);
    expect(renders).toBe(before + 1);
  });
});
