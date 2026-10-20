import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { benchProbe, resetBenchProbe } from "@/shared/lib/bench-probe";
import { FakeBenchRuntime } from "@/test/fake-bench-runtime";
import { useLiveFrameStats } from "./use-live-frame-stats";
import { useProbeEvents } from "./use-probe-events";

afterEach(() => {
  resetBenchProbe();
});

describe("useLiveFrameStats", () => {
  it("publishes rolling FPS while active and stops its loop when inactive", () => {
    const runtime = new FakeBenchRuntime(1000 / 60);
    const readHeap = () => ({ usedBytes: 1, totalBytes: 2, limitBytes: 3 });
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useLiveFrameStats(active, 1000 / 60, {
          runtime,
          readHeap,
          publishMs: 100,
          windowMs: 1_000,
        }),
      { initialProps: { active: true } },
    );
    expect(result.current).toBeNull();
    act(() => {
      for (let i = 0; i < 30; i++) runtime.frame();
    });
    expect(result.current?.snapshot.window.fps.median).toBeCloseTo(60);
    expect(result.current?.snapshot.currentFps).toBeCloseTo(60);
    expect(result.current?.heap).toEqual({ usedBytes: 1, totalBytes: 2, limitBytes: 3 });
    expect(runtime.pendingFrames).toBe(1);

    rerender({ active: false });
    expect(result.current).toBeNull();
    expect(runtime.pendingFrames).toBe(0);
  });
});

describe("useProbeEvents", () => {
  it("starts from the probe history and appends new events", () => {
    benchProbe("topology-fetch-start", { networkId: "n" });
    const { result } = renderHook(() => useProbeEvents());
    expect(result.current.map((e) => e.name)).toEqual(["topology-fetch-start"]);
    act(() => {
      benchProbe("topology-fetch-end", { networkId: "n" });
    });
    expect(result.current.map((e) => e.name)).toEqual([
      "topology-fetch-start",
      "topology-fetch-end",
    ]);
  });
});
