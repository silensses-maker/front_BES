import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBenchRuntime } from "@/test/fake-bench-runtime";
import {
  createFrameRecorder,
  type LongTaskEntryLite,
  longTasksSupported,
  makeRecording,
  observeBrowserLongTasks,
  readBrowserHeap,
  splitRecording,
} from "./frame-recorder";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFrameRecorder", () => {
  it("records rAF deltas between start and stop, heap samples and long tasks", () => {
    const runtime = new FakeBenchRuntime(10);
    let used = 1_000;
    const hooks: { emit?: (entries: readonly LongTaskEntryLite[]) => void } = {};
    const flush = vi.fn();
    const disconnect = vi.fn();
    const recorder = createFrameRecorder({
      runtime,
      readHeap: () => ({ usedBytes: (used += 100), totalBytes: 5_000, limitBytes: 9_000 }),
      observeLongTasks: (onEntries) => {
        hooks.emit = onEntries;
        return { flush, disconnect };
      },
      heapSampleMs: 20,
    });

    runtime.frame();
    recorder.start();
    expect(recorder.running).toBe(true);
    for (let i = 0; i < 10; i++) runtime.frame();
    hooks.emit?.([
      { startTime: -5, duration: 80 },
      { startTime: runtime.now() - 5, duration: 60 },
      { startTime: runtime.now() - 2, duration: 90 },
    ]);
    const rec = recorder.stop();

    expect(recorder.running).toBe(false);
    expect(rec.deltas).toHaveLength(9);
    expect(rec.deltas.every((d) => d === 10)).toBe(true);
    expect(rec.endedAt - rec.startedAt).toBe(100);
    expect(rec.longTasks).toEqual({ supported: true, count: 2, totalMs: 150, maxMs: 90 });
    expect(flush).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(rec.heap.supported).toBe(true);
    expect(rec.heap.samples).toBeGreaterThan(2);
    expect(rec.heap.minBytes).toBe(1_100);
    expect(rec.heap.maxBytes).toBe(rec.heap.endBytes);
    expect(rec.heap.limitBytes).toBe(9_000);
    expect(runtime.pendingFrames).toBe(0);
  });

  it("reports unsupported heap / long tasks and ignores a second start", () => {
    const runtime = new FakeBenchRuntime();
    const recorder = createFrameRecorder({
      runtime,
      readHeap: () => null,
      observeLongTasks: () => null,
    });
    recorder.start();
    recorder.start();
    runtime.frame();
    runtime.frame();
    const rec = recorder.stop();
    expect(rec.deltas).toHaveLength(1);
    expect(rec.longTasks.supported).toBe(false);
    expect(rec.heap).toEqual({
      supported: false,
      samples: 0,
      minBytes: null,
      maxBytes: null,
      endBytes: null,
      totalEndBytes: null,
      limitBytes: null,
    });
  });
});

describe("browser sources", () => {
  it("reads performance.memory when present", () => {
    expect(readBrowserHeap()).toBeNull();
    const perf = performance as Performance & { memory?: unknown };
    perf.memory = { usedJSHeapSize: 1, totalJSHeapSize: 2, jsHeapSizeLimit: 3 };
    try {
      expect(readBrowserHeap()).toEqual({ usedBytes: 1, totalBytes: 2, limitBytes: 3 });
    } finally {
      delete perf.memory;
    }
  });

  it("observes long tasks only where the entry type is supported", () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    expect(longTasksSupported()).toBe(false);
    expect(observeBrowserLongTasks(() => {})).toBeNull();

    const observe = vi.fn();
    const disconnect = vi.fn();
    type ObserverCallback = (list: { getEntries: () => LongTaskEntryLite[] }) => void;
    const hooks: { callback?: ObserverCallback } = {};
    class FakeObserver {
      static supportedEntryTypes = ["longtask"];
      constructor(cb: ObserverCallback) {
        hooks.callback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      takeRecords = () => [{ startTime: 1, duration: 70 }];
    }
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    expect(longTasksSupported()).toBe(true);
    const seen: LongTaskEntryLite[] = [];
    const handle = observeBrowserLongTasks((entries) => seen.push(...entries));
    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: false });
    hooks.callback?.({ getEntries: () => [{ startTime: 0, duration: 55 }] });
    handle?.flush();
    handle?.disconnect();
    expect(seen.map((e) => e.duration)).toEqual([55, 70]);
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("splitRecording", () => {
  const rec = makeRecording(
    0,
    100,
    [5, 10, 15, 60, 70, 80],
    [
      { startTime: 20, duration: 40 },
      { startTime: 75, duration: 55 },
    ],
    true,
    [
      { at: 0, usedBytes: 10, totalBytes: 20, limitBytes: 30 },
      { at: 50, usedBytes: 40, totalBytes: 50, limitBytes: 60 },
      { at: 90, usedBytes: 15, totalBytes: 25, limitBytes: 60 },
    ],
  );

  it("keeps the raw data and the summaries", () => {
    expect(rec.deltas).toEqual([5, 5, 45, 10, 10]);
    expect(rec.longTasks).toEqual({ supported: true, count: 2, totalMs: 95, maxMs: 55 });
    expect(rec.heap).toMatchObject({ samples: 3, minBytes: 10, maxBytes: 40, endBytes: 15 });
  });

  it("drops the interval that spans the cut from both sides", () => {
    const { lead, main } = splitRecording(rec, 50);
    expect(lead.frameTimes).toEqual([5, 10, 15]);
    expect(lead.deltas).toEqual([5, 5]);
    expect(lead.endedAt).toBe(50);
    expect(lead.longTasks.count).toBe(1);
    expect(lead.heap.samples).toBe(1);
    expect(main.frameTimes).toEqual([60, 70, 80]);
    expect(main.deltas).toEqual([10, 10]);
    expect(main.startedAt).toBe(60);
    expect(main.endedAt).toBe(100);
    expect(main.longTasks).toMatchObject({ supported: true, count: 1, totalMs: 55 });
    expect(main.heap).toMatchObject({ samples: 2, maxBytes: 40, endBytes: 15 });
  });

  it("clamps the cut to the recording", () => {
    expect(splitRecording(rec, -10).lead.frameTimes).toEqual([]);
    const late = splitRecording(rec, 500);
    expect(late.main.frameTimes).toEqual([]);
    expect(late.main.startedAt).toBe(100);
    expect(late.main.heap.supported).toBe(false);
  });
});
