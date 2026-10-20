import { estimateRefreshInterval } from "./frame-stats";
import type { BenchRuntime } from "./runtime";

/**
 * Samples requestAnimationFrame for `durationMs` on an idle page and estimates the display
 * refresh interval (ms) — the reference for the dropped-frames estimate.
 */
export function sampleRefreshInterval(
  runtime: BenchRuntime,
  durationMs = 1_000,
): Promise<number | null> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let previous: number | null = null;
    let started: number | null = null;
    const step = (ts: number) => {
      if (previous !== null) deltas.push(ts - previous);
      previous = ts;
      started ??= ts;
      if (ts - started >= durationMs) {
        resolve(estimateRefreshInterval(deltas));
        return;
      }
      runtime.requestFrame(step);
    };
    runtime.requestFrame(step);
  });
}
