import { afterEach, describe, expect, it, vi } from "vitest";
import {
  indexChunkBuffer,
  mergeRoundFromChunk,
} from "@/features/simulation-replay/lib/replay-chunks";
import type { TopologyResponse } from "@/shared/api/backend";
import { benchProbe, registerBenchCanvas, resetBenchProbe } from "@/shared/lib/bench-probe";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { FakeBenchRuntime } from "@/test/fake-bench-runtime";
import { createFrameRecorder } from "../lib/frame-recorder";
import { DEFAULT_SUITE_CONFIG, type SuiteConfig } from "../lib/suite-config";
import { type BenchStage, runScenario, runSuite, type SuiteRunnerDeps } from "./suite-runner";

const TIMINGS = { layoutMs: 300, clusterMs: 200, declusterMs: 100 };

const CONFIG: SuiteConfig = {
  ...DEFAULT_SUITE_CONFIG,
  sizes: [60],
  densities: [2],
  repetitions: 1,
  warmupMs: 100,
  measureMs: 500,
  settleMs: 50,
  repaintSpeeds: [1, 16],
  ringRounds: 8,
  interactionStepMs: 100,
  loadTimeoutMs: 5_000,
  prewarm: false,
};

type CanvasBehaviour = "normal" | "silent" | "error" | "no-handle" | "no-tick";

/** Fake upload: layout commit → data rebuilt in Cosmograph (ms). */
const UPLOAD_MS = 100;

function setup(behaviour: CanvasBehaviour = "normal") {
  const runtime = new FakeBenchRuntime();
  // Probe events are stamped with performance.now(): put it on the virtual clock too.
  vi.spyOn(performance, "now").mockImplementation(() => runtime.time);
  const cosmograph = {
    fitView: vi.fn(),
    getZoomLevel: vi.fn(() => 1),
    setZoomLevel: vi.fn(),
    zoomToPoint: vi.fn(),
  };
  // Grouping: Cosmograph applies the clusters, then the simulation ticks with them.
  const setClusterMode = vi.fn((mode: string | null) => {
    if (mode === null || current === null) return;
    const d = current;
    void (async () => {
      await runtime.sleep(60);
      benchProbe("cosmograph-clusters-updated", d);
      await runtime.sleep(16);
      benchProbe("cosmograph-first-tick", d);
    })();
  });
  const setOverlay = vi.fn();
  let current: { runId: string; networkId: string } | null = null;
  // Cosmograph updates still in flight, sampled at every unmount (must be 0)
  let pending = 0;
  const pendingAtUnmount: number[] = [];
  const frames: MergedFrame[] = [];
  const mounted: TopologyResponse[] = [];
  let unregister: (() => void) | null = null;

  const unmount = vi.fn(() => {
    pendingAtUnmount.push(pending);
    unregister?.();
    unregister = null;
  });
  const setPlaybackActive = vi.fn<(active: boolean) => void>();
  const stage: BenchStage = {
    mount: (topology) => {
      mounted.push(topology);
      if (behaviour === "silent") return;
      const d = {
        runId: topology.runId,
        networkId: topology.networkId,
        agents: topology.agents.length,
        edges: topology.edges.length,
      };
      current = { runId: topology.runId, networkId: topology.networkId };
      void (async () => {
        benchProbe("canvas-prepare-start", d);
        await runtime.sleep(16);
        benchProbe("canvas-to-data-end", d);
        await runtime.sleep(50);
        if (behaviour === "error") {
          benchProbe("canvas-error", d);
          return;
        }
        benchProbe("canvas-prepare-end", d);
        await runtime.sleep(16);
        if (behaviour !== "no-handle") {
          unregister = registerBenchCanvas({
            networkId: topology.networkId,
            getCosmograph: () => cosmograph,
            setClusterMode,
            setOverlay,
            getRenderer: () => "ANGLE (fake GPU)",
            pendingUpdates: () => pending,
          });
        }
        benchProbe("canvas-layout-start", d);
        await runtime.sleep(UPLOAD_MS);
        benchProbe("cosmograph-graph-rebuilt", d);
        if (behaviour !== "no-tick") benchProbe("cosmograph-first-tick", d);
        await runtime.sleep(TIMINGS.layoutMs - UPLOAD_MS);
        benchProbe("canvas-frozen", d);
      })();
    },
    unmount,
    setPlaybackActive,
    // The canvas commits the frame, then Cosmograph's setConfig settles and recolours.
    showFrame: (frame) => {
      frames.push(frame);
      const d = { networkId: frame.networkId };
      pending++;
      void (async () => {
        await runtime.sleep(1);
        benchProbe("canvas-frame-commit", { ...d, round: frame.round });
        // the update settles a few frames later
        await runtime.sleep(60);
        pending--;
        benchProbe("cosmograph-colors-updated", d);
        benchProbe("cosmograph-config-done", { ...d, durationMs: 30, syncMs: 2 });
      })();
    },
    size: () => ({ width: 640, height: 480 }),
  };

  const measureUaMemory = vi.fn(async () => ({ status: "unavailable" as const, bytes: null }));
  const gc = vi.fn();
  const deps: SuiteRunnerDeps = {
    stage,
    openFrames: (buffer, agents) => {
      const rounds = indexChunkBuffer(buffer);
      return (round) =>
        mergeRoundFromChunk({ from: 0, to: rounds.size - 1, buffer, rounds }, round, agents);
    },
    runtime,
    createRecorder: () =>
      createFrameRecorder({ runtime, readHeap: () => null, observeLongTasks: () => null }),
    measureUaMemory,
    canvasTimings: TIMINGS,
    playbackBaseRps: 10,
    refreshIntervalMs: 1000 / 60,
    devicePixelRatio: 2,
    gc,
  };
  return {
    runtime,
    deps,
    unmount,
    setPlaybackActive,
    cosmograph,
    setClusterMode,
    setOverlay,
    frames,
    pendingAtUnmount,
    mounted,
    measureUaMemory,
    gc,
  };
}

afterEach(() => {
  resetBenchProbe();
  vi.restoreAllMocks();
});

describe("runSuite", () => {
  it("loads the seeded network into the stage and measures every phase", async () => {
    const t = setup();
    const progress: string[] = [];
    const done = vi.fn();
    const results = await t.runtime.run(
      runSuite(CONFIG, t.deps, new AbortController().signal, {
        onProgress: (p) => progress.push(`${p.index + 1}/${p.total} ${p.step}`),
        onScenarioDone: done,
      }),
    );

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r?.status).toBe("ok");
    expect(r?.error).toBeNull();
    expect(done).toHaveBeenCalledWith(r);
    expect(progress).toEqual([
      "1/1 settle",
      "1/1 load",
      "1/1 idle",
      "1/1 interaction",
      "1/1 repaint x1",
      "1/1 repaint x16",
      "1/1 cluster strategy",
    ]);
    expect(r?.phases.map((p) => (p.variant ? `${p.phase}:${p.variant}` : p.phase))).toEqual([
      "layout",
      "idle",
      "interaction",
      "repaint:x1",
      "repaint:x16",
      "cluster-layout:strategy",
      "cluster-idle:strategy",
      "cluster-interaction:strategy",
    ]);

    // The stage received the JSON-round-tripped topology of the scenario's seed
    const topology = t.mounted[0];
    expect(topology?.agents).toHaveLength(60);
    expect(topology?.edges).toHaveLength(r?.edges ?? -1);
    expect(r?.networkId).toBe(topology?.networkId);
    expect(r?.stage).toEqual({ width: 640, height: 480, devicePixelRatio: 2 });
    expect(r?.forcedGc).toBe(true);

    // Load timings come from the probe events (fake clock)
    // (the fake clock advances one 16.7 ms frame at a time)
    expect(r?.load.toDataMs).toBeGreaterThanOrEqual(16);
    expect(r?.load.toDataMs).toBeLessThan(34);
    expect(r?.load.prepareMs).toBeGreaterThanOrEqual(50);
    expect(r?.load.prepareMs).toBeLessThan(70);
    expect(r?.load.layoutMs).toBeGreaterThanOrEqual(300);
    expect(r?.load.generateMs).toBe(0);
    expect(r?.load.totalMs).toBeGreaterThan(300);
    expect(r?.gpuMemoryEstimate?.kind).toBe("estimate");

    const byName = (name: string, variant: string | null = null) =>
      r?.phases.find((p) => p.phase === name && p.variant === variant);
    // The layout window starts at the first frame drawn with the data; the upload is the lead
    const layout = byName("layout");
    expect(layout?.lead).toMatchObject({ label: "upload", startedBy: "first-tick" });
    expect(layout?.lead?.durationMs).toBeGreaterThanOrEqual(UPLOAD_MS);
    expect(layout?.lead?.durationMs).toBeLessThan(UPLOAD_MS + 34);
    expect(r?.load.uploadMs).toBe(layout?.lead?.durationMs);
    expect(r?.load.uploadLongTasks).toBeNull(); // long tasks unsupported in the fake
    expect(layout?.actualMs).toBeLessThan(TIMINGS.layoutMs - UPLOAD_MS + 34);
    expect(layout?.frames.frames).toBeGreaterThan(5);
    expect(layout).toMatchObject({
      canvasVariant: "baseline",
      links: { inData: r?.edges, drawn: r?.edges },
    });
    expect(r?.canvasRenderer).toBe("ANGLE (fake GPU)");
    expect(r?.timeline?.map((e) => e.event)).toContain("cosmograph-first-tick");
    // …and the grouping window at the first frame drawn with the clusters
    const cluster = byName("cluster-layout", "strategy");
    expect(cluster?.lead).toMatchObject({ label: "cluster-update", startedBy: "first-tick" });
    expect(cluster?.lead?.durationMs).toBeGreaterThanOrEqual(60);
    expect(cluster?.measureMs).toBe(TIMINGS.clusterMs);
    expect(byName("idle")?.frames.fps.median).toBeCloseTo(60);
    expect(byName("idle")?.measureMs).toBe(500);
    expect(byName("idle")?.warmupMs).toBe(100);
    expect(t.measureUaMemory).toHaveBeenCalledTimes(1);

    // Repaint: rounds through the real replay merge path at BASE_RPS × speed
    const x1 = byName("repaint", "x1")?.repaint;
    const x16 = byName("repaint", "x16")?.repaint;
    expect(x1?.targetRoundsPerSecond).toBe(10);
    expect(x1?.roundsRendered).toBeGreaterThanOrEqual(4);
    expect(x1?.roundsRendered).toBeLessThanOrEqual(6);
    expect(x16?.roundsRendered).toBeGreaterThan(25);
    expect(t.frames.length).toBeGreaterThan(30);
    expect(t.frames.every((f) => f.networkId === topology?.networkId)).toBe(true);
    expect(t.frames.every((f) => f.round >= 0 && f.round < CONFIG.ringRounds)).toBe(true);
    expect(t.setPlaybackActive.mock.calls).toEqual([[true], [false], [true], [false]]);
    // Per-round breakdown: commits matched to rounds, Cosmograph updates timed
    const breakdown = x1?.breakdown;
    expect(breakdown?.rounds).toBe(x1?.roundsRendered);
    expect(breakdown?.commitMs.median).toBeGreaterThan(0);
    expect(breakdown?.cosmographUpdates).toBeGreaterThan(0);
    expect(breakdown?.cosmographUpdateMs.median).toBe(30);
    expect(breakdown?.cosmographSyncMs.median).toBe(2);
    expect(breakdown?.colorUpdates).toBeGreaterThan(0);
    expect(breakdown?.mergeMs.median).toBe(0); // the fake clock does not move inside a frame
    expect(breakdown?.longTaskMsPerSecond).toBeNull();

    // Interaction and clustering drive the canvas handle
    expect(t.cosmograph.setZoomLevel).toHaveBeenCalled();
    expect(t.cosmograph.zoomToPoint).toHaveBeenCalled();
    expect(t.cosmograph.fitView).toHaveBeenCalled();
    expect(t.setClusterMode.mock.calls).toEqual([["strategy"], [null]]);
    expect(t.unmount).toHaveBeenCalledTimes(2);
    // the canvas is never destroyed under in-flight Cosmograph updates
    expect(t.pendingAtUnmount).toEqual([0, 0]);
  });

  it("loads an unmeasured pre-warm network first when enabled", async () => {
    const t = setup();
    const onPrewarm = vi.fn();
    const steps: string[] = [];
    const results = await t.runtime.run(
      runSuite(
        { ...CONFIG, phases: ["idle"], prewarm: true },
        t.deps,
        new AbortController().signal,
        {
          onPrewarm,
          onProgress: (p) => steps.push(`${p.scenario.id}:${p.index}:${p.step}`),
        },
      ),
    );
    expect(t.mounted.map((m) => m.agents.length)).toEqual([500, 60]);
    expect(onPrewarm).toHaveBeenCalledTimes(1);
    const prewarm = onPrewarm.mock.calls[0]?.[0];
    expect(prewarm).toMatchObject({ id: "prewarm-n500-d2", status: "ok", phases: [] });
    expect(prewarm.load.prepareMs).not.toBeNull();
    expect(results.map((r) => r.id)).toEqual(["n60-d2-r1"]);
    expect(steps.slice(0, 2)).toEqual(["prewarm-n500-d2:-1:settle", "prewarm-n500-d2:-1:load"]);
  });

  it("stops after an aborted pre-warm", async () => {
    const t = setup("silent");
    const controller = new AbortController();
    const promise = runSuite({ ...CONFIG, prewarm: true }, t.deps, controller.signal);
    for (let i = 0; i < 30; i++) {
      t.runtime.frame();
      await Promise.resolve();
    }
    controller.abort();
    expect(await t.runtime.run(promise)).toEqual([]);
  });

  it("measures the canvas variants after the baseline, reloading for one link per pair", async () => {
    const t = setup();
    const results = await t.runtime.run(
      runSuite(
        {
          ...CONFIG,
          phases: ["idle", "interaction", "repaint"],
          repaintSpeeds: [1],
          canvasVariants: ["links-transparent", "links-off", "straight-links", "one-link-per-pair"],
        },
        t.deps,
        new AbortController().signal,
      ),
    );
    const r = results[0];
    expect(r?.status).toBe("ok");
    expect(t.setOverlay.mock.calls.map((c) => c[0])).toEqual([
      "links-transparent",
      "baseline",
      "links-off",
      "baseline",
      "straight-links",
      "baseline",
    ]);
    expect(r?.phases.map((p) => `${p.canvasVariant}:${p.phase}`)).toEqual([
      "baseline:idle",
      "baseline:interaction",
      "baseline:repaint",
      "links-transparent:idle",
      "links-transparent:interaction",
      "links-transparent:repaint",
      "links-off:idle",
      "links-off:interaction",
      "links-off:repaint",
      "straight-links:idle",
      "straight-links:interaction",
      "straight-links:repaint",
      "one-link-per-pair:idle",
      "one-link-per-pair:interaction",
      "one-link-per-pair:repaint",
    ]);
    const edges = r?.edges ?? 0;
    expect(r?.phases.find((p) => p.canvasVariant === "links-off")?.links).toEqual({
      inData: edges,
      drawn: 0,
    });
    expect(r?.phases.find((p) => p.canvasVariant === "one-link-per-pair")?.links).toEqual({
      inData: edges / 2,
      drawn: edges / 2,
    });
    // one remount with the deduplicated data, with its own load timings
    expect(t.mounted.map((m) => m.edges.length)).toEqual([edges, edges / 2]);
    expect(r?.variantLoads?.["one-link-per-pair"]).toMatchObject({ links: edges / 2 });
    expect(r?.variantLoads?.["one-link-per-pair"]?.uploadMs).toBeGreaterThanOrEqual(UPLOAD_MS);
    expect(t.pendingAtUnmount.every((n) => n === 0)).toBe(true);
  });

  it("falls back to the whole layout window when Cosmograph never ticks", async () => {
    const t = setup("no-tick");
    const results = await t.runtime.run(
      runSuite({ ...CONFIG, phases: ["layout"] }, t.deps, new AbortController().signal),
    );
    const layout = results[0]?.phases[0];
    expect(layout?.lead).toMatchObject({ startedBy: "fallback", durationMs: 0 });
    expect(results[0]?.load.uploadMs).toBeNull();
  });

  it("measures only the selected phases", async () => {
    const t = setup();
    const results = await t.runtime.run(
      runSuite({ ...CONFIG, phases: ["idle"] }, t.deps, new AbortController().signal),
    );
    expect(results[0]?.phases.map((p) => p.phase)).toEqual(["idle"]);
    expect(t.frames).toHaveLength(0);
    expect(t.setClusterMode).not.toHaveBeenCalled();
  });

  it("stops at an abort and marks the scenario", async () => {
    const t = setup();
    const controller = new AbortController();
    const promise = runSuite({ ...CONFIG, repetitions: 3 }, t.deps, controller.signal);
    for (let i = 0; i < 60; i++) {
      t.runtime.frame();
      await Promise.resolve();
    }
    controller.abort();
    const results = await t.runtime.run(promise);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("aborted");
  });
});

describe("runScenario failures", () => {
  const spec = { id: "n60-d2-r1", agents: 60, density: 2, repetition: 1, order: 0 };

  it("gives up when the canvas never freezes", async () => {
    const t = setup("silent");
    const r = await t.runtime.run(runScenario(spec, CONFIG, t.deps, new AbortController().signal));
    expect(r.status).toBe("error");
    expect(r.error).toBe("canvas did not freeze within 5 s");
    expect(r.phases).toEqual([]);
  });

  it("reports a canvas data-prep error", async () => {
    const t = setup("error");
    const r = await t.runtime.run(runScenario(spec, CONFIG, t.deps, new AbortController().signal));
    expect(r.status).toBe("error");
    expect(r.error).toBe("canvas reported a data-prep error");
    expect(r.load.toDataMs).not.toBeNull();
  });

  it("requires the canvas handle of the scenario's network", async () => {
    const t = setup("no-handle");
    const r = await t.runtime.run(runScenario(spec, CONFIG, t.deps, new AbortController().signal));
    expect(r.status).toBe("error");
    expect(r.error).toBe("canvas handle not registered for this network");
  });
});
