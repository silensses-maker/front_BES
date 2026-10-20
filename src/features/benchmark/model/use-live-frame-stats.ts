import { useEffect, useRef, useState } from "react";
import { type HeapReading, readBrowserHeap } from "../lib/frame-recorder";
import { RollingFrameWindow } from "../lib/frame-stats";
import { type BenchRuntime, browserRuntime } from "../lib/runtime";

export interface LiveFrameStats {
  snapshot: ReturnType<RollingFrameWindow["snapshot"]>;
  heap: HeapReading | null;
}

/**
 * Live FPS for the HUD (#126): its own rAF loop feeds a rolling window, published to React at
 * most every `publishMs` so the HUD's re-renders stay cheap. The loop only runs while `active`.
 */
export function useLiveFrameStats(
  active: boolean,
  refreshIntervalMs: number | null,
  options: {
    windowMs?: number;
    publishMs?: number;
    runtime?: BenchRuntime;
    readHeap?: () => HeapReading | null;
  } = {},
): LiveFrameStats | null {
  const {
    windowMs = 5_000,
    publishMs = 250,
    runtime = browserRuntime,
    readHeap = readBrowserHeap,
  } = options;
  const [stats, setStats] = useState<LiveFrameStats | null>(null);
  const refreshRef = useRef(refreshIntervalMs);
  refreshRef.current = refreshIntervalMs;

  useEffect(() => {
    if (!active) return;
    const rolling = new RollingFrameWindow(windowMs);
    let previous: number | null = null;
    let lastPublish = Number.NEGATIVE_INFINITY;
    let handle = 0;
    const step = (ts: number) => {
      if (previous !== null) rolling.push(ts - previous);
      previous = ts;
      if (ts - lastPublish >= publishMs) {
        lastPublish = ts;
        setStats({ snapshot: rolling.snapshot(refreshRef.current), heap: readHeap() });
      }
      handle = runtime.requestFrame(step);
    };
    handle = runtime.requestFrame(step);
    return () => runtime.cancelFrame(handle);
  }, [active, windowMs, publishMs, runtime, readHeap]);

  return active ? stats : null;
}
