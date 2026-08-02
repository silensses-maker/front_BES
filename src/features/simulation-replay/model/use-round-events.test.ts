import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useRoundEvents } from "./use-round-events";

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

const KEY = "run-1|net-1";

function makeFrame(round: number, publicBelief: number[], speaking: number[]): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(publicBelief),
    privateBelief: new Float32Array(publicBelief),
    speaking: new Uint8Array(speaking),
  };
}

describe("useRoundEvents", () => {
  beforeEach(() => {
    useSimulationStore.getState().reset();
    useRoundAggregatesStore.getState().reset();
  });

  it("returns no events with an empty aggregates buffer", () => {
    const { result } = renderHook(() => useRoundEvents());
    expect(result.current).toEqual([]);
  });

  it("detects events over the ingested prefix and recomputes on new rounds", () => {
    const { result } = renderHook(() => useRoundEvents());

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(0, [0.1, 0.9], [1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(1, [0.4, 0.6], [1, 1]));
      useSimulationStore.setState({ status: "running", receivedRound: 1 });
    });

    expect(result.current.find((e) => e.kind === "fin")).toBeUndefined(); // still live

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(2, [0.9, 0.9], [1, 0]));
      useSimulationStore.setState({ receivedRound: 2 });
    });

    // The 0.5 → 0.9 jump moves the biggest-shift event to round 2
    expect(result.current.find((e) => e.labelKey === "runView.eventMeanShift")?.round).toBe(2);
    expect(result.current.find((e) => e.kind === "fin")).toBeUndefined(); // still live
  });

  it("adds the final verdict event once the run completes", () => {
    const { result } = renderHook(() => useRoundEvents());

    // Shift/halving land on round 1; round 2 is quiet so "fin" survives dedup
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(0, [0.1, 0.9], [1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(1, [0.8, 0.8], [1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(2, [0.8, 0.8], [1, 1]));
      useSimulationStore.setState({
        status: "completed",
        receivedRound: 2,
        finalRound: 2,
        consensus: true,
      });
    });

    const fin = result.current.find((e) => e.kind === "fin");
    expect(fin?.round).toBe(2);
    expect(fin?.labelKey).toBe("runView.eventConsensus");
  });

  it("uses maxRound as the final-round fallback when the store has none", () => {
    const { result } = renderHook(() => useRoundEvents());

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(0, [0.1, 0.9], [1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(1, [0.9, 0.9], [1, 1]));
      useRoundAggregatesStore.getState().ingest(KEY, makeFrame(3, [0.9, 0.9], [1, 1]));
      useSimulationStore.setState({ status: "completed", receivedRound: 3, consensus: false });
    });

    const fin = result.current.find((e) => e.kind === "fin");
    expect(fin?.round).toBe(3);
    expect(fin?.labelKey).toBe("runView.eventNoConsensus");
  });
});
