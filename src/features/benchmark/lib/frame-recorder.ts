import type { BenchRuntime } from "./runtime";

/**
 * Records one measured window (#126): every requestAnimationFrame delta, long tasks
 * (`PerformanceObserver('longtask')` where supported) and JS heap samples
 * (`performance.memory`, Chromium only).
 */

export interface HeapReading {
  usedBytes: number;
  totalBytes: number;
  limitBytes: number;
}

export interface LongTaskEntryLite {
  startTime: number;
  duration: number;
}

export interface LongTaskObserverHandle {
  /** Delivers the entries still queued in the observer. */
  flush(): void;
  disconnect(): void;
}

/** Starts observing long tasks; null when the browser does not support them. */
export type LongTaskObserverFactory = (
  onEntries: (entries: readonly LongTaskEntryLite[]) => void,
) => LongTaskObserverHandle | null;

export interface PhaseRecording {
  startedAt: number;
  endedAt: number;
  deltas: number[];
  longTasks: { supported: boolean; count: number; totalMs: number; maxMs: number };
  heap: {
    supported: boolean;
    samples: number;
    minBytes: number | null;
    maxBytes: number | null;
    endBytes: number | null;
    totalEndBytes: number | null;
    limitBytes: number | null;
  };
}

export interface FrameRecorderDeps {
  runtime: BenchRuntime;
  readHeap: () => HeapReading | null;
  observeLongTasks: LongTaskObserverFactory;
  /** Heap sampling period (ms of frame time). */
  heapSampleMs?: number;
}

export interface FrameRecorder {
  start(): void;
  stop(): PhaseRecording;
  readonly running: boolean;
}

export function createFrameRecorder(deps: FrameRecorderDeps): FrameRecorder {
  const { runtime, readHeap, observeLongTasks } = deps;
  const heapSampleMs = deps.heapSampleMs ?? 250;

  let running = false;
  let handle: number | null = null;
  let startedAt = 0;
  let previous: number | null = null;
  let lastHeapSample = Number.NEGATIVE_INFINITY;
  let deltas: number[] = [];
  let observer: LongTaskObserverHandle | null = null;
  let longTasks = { count: 0, totalMs: 0, maxMs: 0 };
  let heap = { samples: 0, min: Number.POSITIVE_INFINITY, max: 0, end: null as HeapReading | null };

  const sampleHeap = () => {
    const reading = readHeap();
    if (reading === null) return;
    heap.samples++;
    heap.min = Math.min(heap.min, reading.usedBytes);
    heap.max = Math.max(heap.max, reading.usedBytes);
    heap.end = reading;
  };

  const onFrame = (timestamp: number) => {
    if (!running) return;
    if (previous !== null) deltas.push(timestamp - previous);
    previous = timestamp;
    if (timestamp - lastHeapSample >= heapSampleMs) {
      lastHeapSample = timestamp;
      sampleHeap();
    }
    handle = runtime.requestFrame(onFrame);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      deltas = [];
      previous = null;
      lastHeapSample = Number.NEGATIVE_INFINITY;
      longTasks = { count: 0, totalMs: 0, maxMs: 0 };
      heap = { samples: 0, min: Number.POSITIVE_INFINITY, max: 0, end: null };
      startedAt = runtime.now();
      observer = observeLongTasks((entries) => {
        for (const entry of entries) {
          if (entry.startTime < startedAt) continue;
          longTasks.count++;
          longTasks.totalMs += entry.duration;
          longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
        }
      });
      sampleHeap();
      handle = runtime.requestFrame(onFrame);
    },
    stop() {
      const endedAt = runtime.now();
      running = false;
      if (handle !== null) runtime.cancelFrame(handle);
      handle = null;
      sampleHeap();
      const supported = observer !== null;
      observer?.flush();
      observer?.disconnect();
      observer = null;
      return {
        startedAt,
        endedAt,
        deltas,
        longTasks: { supported, ...longTasks },
        heap: {
          supported: heap.samples > 0,
          samples: heap.samples,
          minBytes: heap.samples > 0 ? heap.min : null,
          maxBytes: heap.samples > 0 ? heap.max : null,
          endBytes: heap.end?.usedBytes ?? null,
          totalEndBytes: heap.end?.totalBytes ?? null,
          limitBytes: heap.end?.limitBytes ?? null,
        },
      };
    },
  };
}

interface ChromiumMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** `performance.memory` (non-standard, Chromium); null elsewhere. */
export function readBrowserHeap(): HeapReading | null {
  const memory = (performance as Performance & { memory?: ChromiumMemory }).memory;
  if (!memory || typeof memory.usedJSHeapSize !== "number") return null;
  return {
    usedBytes: memory.usedJSHeapSize,
    totalBytes: memory.totalJSHeapSize,
    limitBytes: memory.jsHeapSizeLimit,
  };
}

export function longTasksSupported(): boolean {
  return (
    typeof PerformanceObserver !== "undefined" &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask")
  );
}

export const observeBrowserLongTasks: LongTaskObserverFactory = (onEntries) => {
  if (!longTasksSupported()) return null;
  const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
  observer.observe({ type: "longtask", buffered: false });
  return {
    flush: () => onEntries(observer.takeRecords()),
    disconnect: () => observer.disconnect(),
  };
};
