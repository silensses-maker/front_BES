import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import {
  type BenchProbeEvent,
  getBenchCanvas,
  resetBenchProbe,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useBenchCanvasProbe } from "./use-bench-canvas-probe";

vi.mock("./bench-cosmograph-probe", () => ({
  attachCosmographProbe: vi.fn(() => ({ detach: vi.fn(), pending: () => 3 })),
  readCosmographRenderer: vi.fn(() => "ANGLE (test GPU)"),
}));

const { attachCosmographProbe } = await import("./bench-cosmograph-probe");

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

const frame = (round: number): MergedFrame => ({
  runId: "run-1",
  networkId: "net-a",
  round,
  publicBelief: new Float32Array(1),
  privateBelief: new Float32Array(1),
  speaking: new Uint8Array(1),
});

interface Props {
  phase: string;
  topology: TopologyResponse | null;
  frame?: MergedFrame | null;
}

function setup(initial: Props, instance: unknown = { id: "cosmograph" }) {
  const cosmographRef = { current: instance as never };
  const setClusterMode = vi.fn();
  const setLinksHidden = vi.fn();
  const setCanvasOverride = vi.fn();
  const hook = renderHook(
    (props: Props) =>
      useBenchCanvasProbe({
        phase: props.phase,
        topology: props.topology,
        frame: props.frame ?? null,
        cosmographRef,
        setClusterMode,
        setLinksHidden,
        setCanvasOverride,
      }),
    { initialProps: initial },
  );
  return { ...hook, cosmographRef, setClusterMode, setLinksHidden, setCanvasOverride };
}

afterEach(() => {
  resetBenchProbe();
  vi.mocked(attachCosmographProbe).mockClear();
  vi.unstubAllGlobals();
});

describe("useBenchCanvasProbe", () => {
  it("emits one event per committed phase change and registers the canvas", () => {
    const events: BenchProbeEvent[] = [];
    subscribeBenchProbe((e) => events.push(e));
    const netA = topology("net-a");
    const { rerender, unmount, setClusterMode } = setup({ phase: "preparing", topology: netA });

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
    expect(handle?.getCosmograph()).toEqual({ id: "cosmograph" });
    expect(handle?.getRenderer()).toBe("ANGLE (test GPU)");
    expect(handle?.pendingUpdates()).toBe(0); // net-b's canvas is in "error": not attached
    handle?.setClusterMode("strategy");
    expect(setClusterMode).toHaveBeenCalledWith("strategy");

    unmount();
    expect(getBenchCanvas()).toBeNull();
  });

  it("attaches the Cosmograph probe while the canvas is mounted, polling for the instance", () => {
    const raf = vi.fn((_cb: FrameRequestCallback) => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const netA = topology("net-a");
    const { rerender, cosmographRef, unmount } = setup(
      { phase: "preparing", topology: netA },
      null,
    );
    expect(attachCosmographProbe).not.toHaveBeenCalled();
    rerender({ phase: "layouting", topology: netA });
    expect(raf).toHaveBeenCalled(); // no instance yet
    cosmographRef.current = { id: "late" } as never;
    act(() => {
      (raf.mock.calls[raf.mock.calls.length - 1]?.[0] as FrameRequestCallback)(0);
    });
    expect(attachCosmographProbe).toHaveBeenCalledWith(
      { id: "late" },
      { runId: "run-1", networkId: "net-a" },
    );
    const attached = vi.mocked(attachCosmographProbe).mock.results[0]?.value as {
      detach: () => void;
    };
    rerender({ phase: "frozen", topology: netA }); // still mounted: no re-attach
    expect(attachCosmographProbe).toHaveBeenCalledTimes(1);
    expect(getBenchCanvas()?.pendingUpdates()).toBe(3);
    unmount();
    expect(attached.detach).toHaveBeenCalled();
  });

  it("reports committed frames and switches canvas variants through the canvas state", () => {
    const events: BenchProbeEvent[] = [];
    subscribeBenchProbe((e) => events.push(e));
    const netA = topology("net-a");
    const { rerender, setLinksHidden, setCanvasOverride } = setup({
      phase: "frozen",
      topology: netA,
    });
    rerender({ phase: "frozen", topology: netA, frame: frame(3) });
    rerender({ phase: "frozen", topology: netA, frame: frame(4) });
    expect(
      events.filter((e) => e.name === "canvas-frame-commit").map((e) => e.detail.round),
    ).toEqual([3, 4]);

    const handle = getBenchCanvas();
    const apply = (overlay: Parameters<NonNullable<typeof handle>["setOverlay"]>[0]) => {
      setCanvasOverride.mockClear();
      handle?.setOverlay(overlay);
      const updater = setCanvasOverride.mock.calls[0]?.[0] as (p: object) => object;
      return updater({ enableSimulation: false, renderLinks: false, curvedLinks: false });
    };
    expect(apply("links-off")).toEqual({ enableSimulation: false, renderLinks: false });
    expect(setLinksHidden).toHaveBeenLastCalledWith(false);
    expect(apply("straight-links")).toEqual({ enableSimulation: false, curvedLinks: false });
    expect(apply("links-transparent")).toEqual({ enableSimulation: false });
    expect(setLinksHidden).toHaveBeenLastCalledWith(true);
    expect(apply("baseline")).toEqual({ enableSimulation: false });
    expect(setLinksHidden).toHaveBeenLastCalledWith(false);
  });

  it("stays silent without a topology", () => {
    const listener = vi.fn();
    subscribeBenchProbe(listener);
    const { rerender } = setup({ phase: "idle", topology: null });
    rerender({ phase: "layouting", topology: null, frame: frame(1) });
    expect(listener).not.toHaveBeenCalled();
    expect(getBenchCanvas()?.networkId).toBeNull();
    expect(attachCosmographProbe).not.toHaveBeenCalled();
  });
});
