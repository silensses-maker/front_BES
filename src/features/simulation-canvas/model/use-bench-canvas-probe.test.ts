import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import {
  type BenchProbeEvent,
  getBenchCanvas,
  resetBenchProbe,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";
import { useBenchCanvasProbe } from "./use-bench-canvas-probe";

const topology = (networkId: string): TopologyResponse => ({
  runId: "run-1",
  networkId,
  agentCount: 2,
  edgeCount: 2,
  agentOffset: 0,
  agentLimit: 2,
  edgeOffset: 0,
  edgeLimit: 2,
  agents: [],
  edges: [],
});

afterEach(() => {
  resetBenchProbe();
});

describe("useBenchCanvasProbe", () => {
  it("emits one event per committed phase change and registers the canvas", () => {
    const events: BenchProbeEvent[] = [];
    subscribeBenchProbe((e) => events.push(e));
    const cosmographRef = { current: undefined };
    const setClusterMode = vi.fn();
    const netA = topology("net-a");
    const { rerender, unmount } = renderHook(
      (props: { phase: string; topology: TopologyResponse | null }) =>
        useBenchCanvasProbe({ ...props, cosmographRef, setClusterMode }),
      { initialProps: { phase: "preparing", topology: netA } },
    );

    rerender({ phase: "layouting", topology: netA });
    rerender({ phase: "layouting", topology: netA });
    rerender({ phase: "frozen", topology: netA });
    // a topology swap renders once with the old phase: no spurious "frozen" for net-b
    const netB = topology("net-b");
    rerender({ phase: "frozen", topology: netB });
    rerender({ phase: "error", topology: netB });

    expect(events.map((e) => `${e.name}:${e.detail.networkId}`)).toEqual([
      "canvas-layout-start:net-a",
      "canvas-frozen:net-a",
      "canvas-error:net-b",
    ]);
    expect(events[0]?.detail).toEqual({ runId: "run-1", networkId: "net-a", agents: 0, edges: 0 });

    const handle = getBenchCanvas();
    expect(handle?.networkId).toBe("net-b");
    expect(handle?.getCosmograph()).toBeUndefined();
    handle?.setClusterMode("strategy");
    expect(setClusterMode).toHaveBeenCalledWith("strategy");

    unmount();
    expect(getBenchCanvas()).toBeNull();
  });

  it("stays silent without a topology", () => {
    const listener = vi.fn();
    subscribeBenchProbe(listener);
    const { rerender } = renderHook(
      (phase: string) =>
        useBenchCanvasProbe({
          phase,
          topology: null,
          cosmographRef: { current: undefined },
          setClusterMode: () => {},
        }),
      { initialProps: "idle" },
    );
    rerender("layouting");
    expect(listener).not.toHaveBeenCalled();
    expect(getBenchCanvas()?.networkId).toBeNull();
  });
});
