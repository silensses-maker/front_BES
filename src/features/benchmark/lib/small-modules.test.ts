import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase } from "@/test/bench-fixtures";
import { FakeBenchRuntime } from "@/test/fake-bench-runtime";
import { currentBuildInfo } from "./build-info";
import { downloadText } from "./download";
import type { PhaseRecording } from "./frame-recorder";
import { buildHudRecordDocument, buildHudSnapshot } from "./hud-document";
import { applyInteractionStep, buildInteractionScript } from "./interaction-script";
import { toPhaseResult } from "./phase-result";
import { sampleRefreshInterval } from "./refresh-rate";
import { EMPTY_LOAD_TIMINGS, validateResultDocument } from "./result-schema";
import { abortError, browserRuntime, isAbortError } from "./runtime";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("interaction script", () => {
  it("cycles fit → zoom in → pan → pan → zoom out → pan, deterministically", () => {
    const script = buildInteractionScript(5, 1_000, 12);
    expect(script.map((s) => s.kind)).toEqual([
      "fit",
      "zoom",
      "pan",
      "pan",
      "zoom",
      "pan",
      "fit",
      "zoom",
      "pan",
      "pan",
      "zoom",
      "pan",
    ]);
    expect(script).toEqual(buildInteractionScript(5, 1_000, 12));
    for (const step of script) {
      if (step.kind === "pan") {
        expect(step.pointIndex).toBeGreaterThanOrEqual(0);
        expect(step.pointIndex).toBeLessThan(1_000);
      }
    }
    expect(buildInteractionScript(5, 0, 3)[2]).toEqual({ kind: "pan", pointIndex: 0, scale: 3 });
  });

  it("drives the Cosmograph camera API", () => {
    const cosmograph = {
      fitView: vi.fn(),
      getZoomLevel: vi.fn(() => 2),
      setZoomLevel: vi.fn(),
      zoomToPoint: vi.fn(),
    };
    applyInteractionStep(cosmograph, { kind: "fit" }, 100);
    applyInteractionStep(cosmograph, { kind: "zoom", factor: 4 }, 100);
    applyInteractionStep(cosmograph, { kind: "pan", pointIndex: 9, scale: 3 }, 100);
    expect(cosmograph.fitView).toHaveBeenCalledWith(100);
    expect(cosmograph.setZoomLevel).toHaveBeenCalledWith(8, 100);
    expect(cosmograph.zoomToPoint).toHaveBeenCalledWith(9, 100, 3, true);
    cosmograph.getZoomLevel.mockReturnValue(undefined as unknown as number);
    applyInteractionStep(cosmograph, { kind: "zoom", factor: 4 });
    expect(cosmograph.setZoomLevel).toHaveBeenCalledTimes(1);
  });
});

describe("toPhaseResult", () => {
  const recording: PhaseRecording = {
    startedAt: 1_000,
    endedAt: 11_000,
    deltas: Array<number>(600).fill(1000 / 60),
    frameTimes: [],
    longTasks: { supported: false, count: 0, totalMs: 0, maxMs: 0 },
    longTaskEntries: [],
    heap: fakePhase("idle", 60).heap,
    heapSamples: [],
  };

  it("summarises the window and the achieved repaint rate", () => {
    const p = toPhaseResult({
      phase: "repaint",
      variant: "x1",
      warmupMs: 2_000,
      measureMs: 10_000,
      recording,
      refreshIntervalMs: 1000 / 60,
      repaint: { speed: 1, baseRps: 10, roundsRendered: 100 },
    });
    expect(p.actualMs).toBe(10_000);
    expect(p.frames.fps.median).toBeCloseTo(60);
    expect(p.repaint).toEqual({
      speed: 1,
      targetRoundsPerSecond: 10,
      roundsRendered: 100,
      repaintsPerSecond: 10,
    });
    expect(p.uaMemory).toBeNull();
  });

  it("leaves repaint null for other phases and guards a zero-length window", () => {
    const p = toPhaseResult({
      phase: "idle",
      warmupMs: 0,
      measureMs: 0,
      recording: { ...recording, endedAt: 1_000, deltas: [] },
      refreshIntervalMs: null,
      repaint: { speed: 4, baseRps: 10, roundsRendered: 0 },
    });
    expect(p.variant).toBeNull();
    expect(p.repaint?.repaintsPerSecond).toBe(0);
    expect(
      toPhaseResult({
        phase: "idle",
        warmupMs: 0,
        measureMs: 1,
        recording,
        refreshIntervalMs: null,
      }).repaint,
    ).toBeNull();
  });
});

describe("HUD documents", () => {
  const network = { runId: "r", networkId: "n", agents: 100, edges: 380, density: 2 };

  it("builds a copyable snapshot", () => {
    const snap = buildHudSnapshot({
      build: fakeDocument([]).build,
      environment: null,
      network,
      live: null,
      heap: null,
      load: EMPTY_LOAD_TIMINGS,
      gpuMemoryEstimate: null,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(snap).toMatchObject({
      harness: "silensess-bench-harness",
      kind: "hud-snapshot",
      capturedAt: "2026-01-01T00:00:00.000Z",
      network,
    });
  });

  it("builds a recording the aggregation script accepts", () => {
    const doc = buildHudRecordDocument({
      build: fakeDocument([]).build,
      environment: fakeEnvironment(),
      network: { ...network, agents: null, edges: null },
      phase: fakePhase("hud-record", 45),
      load: EMPTY_LOAD_TIMINGS,
      gpuMemoryEstimate: null,
      stage: { width: 800, height: 600, devicePixelRatio: 1 },
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      context: { path: "/board/simulation/r/n" },
    });
    expect(validateResultDocument(doc).ok).toBe(true);
    expect(doc.kind).toBe("hud-record");
    expect(doc.complete).toBe(true);
    expect(doc.finishedAt).toBe("2026-01-01T00:00:10.000Z");
    expect(doc.scenarios[0]).toMatchObject({ source: "real-run", agents: 0, edges: 0, density: 2 });
    expect(doc.config).toEqual({ recordMs: 10_000, path: "/board/simulation/r/n" });
  });
});

describe("currentBuildInfo", () => {
  it("reads the injected bench build metadata, with fallbacks", () => {
    expect(currentBuildInfo()).toEqual({
      mode: "test",
      appVersion: "unknown",
      gitCommit: "unknown",
      gitDirty: null,
      builtAt: "unknown",
    });
    expect(
      currentBuildInfo(
        { appVersion: "2.0.13", gitCommit: "abc", gitDirty: true, builtAt: "t" },
        "production",
      ),
    ).toEqual({
      mode: "production",
      appVersion: "2.0.13",
      gitCommit: "abc",
      gitDirty: true,
      builtAt: "t",
    });
  });
});

describe("sampleRefreshInterval", () => {
  it("estimates the refresh interval from idle frames", async () => {
    const runtime = new FakeBenchRuntime(1000 / 144);
    const interval = await runtime.run(sampleRefreshInterval(runtime, 200));
    expect(interval).toBeCloseTo(1000 / 144);
  });
});

describe("runtime", () => {
  it("recognises abort errors", () => {
    expect(isAbortError(abortError())).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });

  it("sleeps with the browser timer and aborts", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void browserRuntime.sleep(100).then(done);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalled();

    const controller = new AbortController();
    const pending = browserRuntime.sleep(1_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("Benchmark aborted");
    await expect(browserRuntime.sleep(1, controller.signal)).rejects.toThrow("Benchmark aborted");
    expect(browserRuntime.now()).toBeGreaterThanOrEqual(0);
  });

  it("wraps requestAnimationFrame", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const cb = () => {};
    expect(browserRuntime.requestFrame(cb)).toBe(7);
    browserRuntime.cancelFrame(7);
    expect(raf).toHaveBeenCalledWith(cb);
    expect(caf).toHaveBeenCalledWith(7);
  });
});

describe("downloadText", () => {
  it("clicks a temporary object-URL link and revokes it", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("a.json", "{}", "application/json");
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
});
