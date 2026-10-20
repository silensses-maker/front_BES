import type { BenchRuntime } from "./runtime";

/**
 * Records one window (#126): the timestamp of every requestAnimationFrame, long tasks
 * (`PerformanceObserver('longtask')` where supported) and JS heap samples
 * (`performance.memory`, Chromium only). The raw timestamps let a window be split after the
 * fact (see `splitRecording`): the layout windows start at the first frame Cosmograph draws
 * with the data, which is only known once the window has been recorded.
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

export interface LongTaskSummary {
  supported: boolean;
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface HeapSummary {
  supported: boolean;
  samples: number;
  minBytes: number | null;
  maxBytes: number | null;
  endBytes: number | null;
  totalEndBytes: number | null;
  limitBytes: number | null;
}

export interface HeapSample extends HeapReading {
  at: number;
}

export interface PhaseRecording {
  startedAt: number;
  endedAt: number;
  /** Frame-to-frame intervals between consecutive recorded frames. */
  deltas: number[];
  /** rAF timestamps of the recorded frames. */
  frameTimes: number[];
  longTasks: LongTaskSummary;
  longTaskEntries: LongTaskEntryLite[];
  heap: HeapSummary;
  heapSamples: HeapSample[];
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

export function summarizeLongTasks(
  entries: readonly LongTaskEntryLite[],
  supported: boolean,
): LongTaskSummary {
  let totalMs = 0;
  let maxMs = 0;
  for (const e of entries) {
    totalMs += e.duration;
    maxMs = Math.max(maxMs, e.duration);
  }
  return { supported, count: entries.length, totalMs, maxMs };
}

export function summarizeHeap(samples: readonly HeapSample[]): HeapSummary {
  if (samples.length === 0) {
    return {
      supported: false,
      samples: 0,
      minBytes: null,
      maxBytes: null,
      endBytes: null,
      totalEndBytes: null,
      limitBytes: null,
    };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const s of samples) {
    min = Math.min(min, s.usedBytes);
    max = Math.max(max, s.usedBytes);
  }
  const end = samples[samples.length - 1] as HeapSample;
  return {
    supported: true,
    samples: samples.length,
    minBytes: min,
    maxBytes: max,
    endBytes: end.usedBytes,
    totalEndBytes: end.totalBytes,
    limitBytes: end.limitBytes,
  };
}

function deltasOf(frameTimes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < frameTimes.length; i++) {
    out.push((frameTimes[i] ?? 0) - (frameTimes[i - 1] ?? 0));
  }
  return out;
}

/** Builds a recording from raw data (frames, long tasks and heap samples inside [start, end]). */
export function makeRecording(
  startedAt: number,
  endedAt: number,
  frameTimes: number[],
  longTaskEntries: LongTaskEntryLite[],
  longTasksSupported: boolean,
  heapSamples: HeapSample[],
): PhaseRecording {
  return {
    startedAt,
    endedAt,
    frameTimes,
    deltas: deltasOf(frameTimes),
    longTaskEntries,
    longTasks: summarizeLongTasks(longTaskEntries, longTasksSupported),
    heapSamples,
    heap: summarizeHeap(heapSamples),
  };
}

/**
 * Splits a recording at `at`: the lead keeps what happened before (frames, long tasks that
 * started, heap samples), the main window what happened from `at` on. The frame interval that
 * spans `at` belongs to neither, so a stall before the first frame of the main window never
 * lands in it.
 */
export function splitRecording(
  rec: PhaseRecording,
  at: number,
): { lead: PhaseRecording; main: PhaseRecording } {
  const cut = Math.min(Math.max(at, rec.startedAt), rec.endedAt);
  const leadFrames = rec.frameTimes.filter((t) => t < cut);
  const mainFrames = rec.frameTimes.filter((t) => t >= cut);
  const supported = rec.longTasks.supported;
  return {
    lead: makeRecording(
      rec.startedAt,
      cut,
      leadFrames,
      rec.longTaskEntries.filter((e) => e.startTime < cut),
      supported,
      rec.heapSamples.filter((s) => s.at < cut),
    ),
    main: makeRecording(
      mainFrames[0] ?? cut,
      rec.endedAt,
      mainFrames,
      rec.longTaskEntries.filter((e) => e.startTime >= cut),
      supported,
      rec.heapSamples.filter((s) => s.at >= cut),
    ),
  };
}

export function createFrameRecorder(deps: FrameRecorderDeps): FrameRecorder {
  const { runtime, readHeap, observeLongTasks } = deps;
  const heapSampleMs = deps.heapSampleMs ?? 250;

  let running = false;
  let handle: number | null = null;
  let startedAt = 0;
  let lastHeapSample = Number.NEGATIVE_INFINITY;
  let frameTimes: number[] = [];
  let longTasks: LongTaskEntryLite[] = [];
  let heapSamples: HeapSample[] = [];
  let observer: LongTaskObserverHandle | null = null;

  const sampleHeap = (at: number) => {
    const reading = readHeap();
    if (reading !== null) heapSamples.push({ ...reading, at });
  };

  const onFrame = (timestamp: number) => {
    if (!running) return;
    frameTimes.push(timestamp);
    if (timestamp - lastHeapSample >= heapSampleMs) {
      lastHeapSample = timestamp;
      sampleHeap(timestamp);
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
      frameTimes = [];
      longTasks = [];
      heapSamples = [];
      lastHeapSample = Number.NEGATIVE_INFINITY;
      startedAt = runtime.now();
      observer = observeLongTasks((entries) => {
        for (const entry of entries) {
          if (entry.startTime >= startedAt) {
            longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        }
      });
      sampleHeap(startedAt);
      handle = runtime.requestFrame(onFrame);
    },
    stop() {
      const endedAt = runtime.now();
      running = false;
      if (handle !== null) runtime.cancelFrame(handle);
      handle = null;
      sampleHeap(endedAt);
      const supported = observer !== null;
      observer?.flush();
      observer?.disconnect();
      observer = null;
      return makeRecording(startedAt, endedAt, frameTimes, longTasks, supported, heapSamples);
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
