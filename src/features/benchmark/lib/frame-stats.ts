/**
 * Frame statistics from requestAnimationFrame deltas (#126).
 *
 * FPS percentiles come from FRAME-TIME percentiles: "p5 FPS" is 1000 / p95(frame time) — the
 * rate the slowest 5 % of frames fall below — and "p1 FPS" is 1000 / p99(frame time).
 * Percentiles interpolate linearly between order statistics (the common "type 7" definition).
 */

/** A frame slower than this misses the 30 FPS budget (OE3 threshold). */
export const SLOW_FRAME_MS = 1000 / 30;
/** A frame slower than this is a visible hitch. */
export const HITCH_FRAME_MS = 50;

export interface FrameSummary {
  frames: number;
  /** Sum of the frame deltas. */
  durationMs: number;
  fps: {
    median: number | null;
    p5: number | null;
    p1: number | null;
    mean: number | null;
  };
  frameTimeMs: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
    mean: number | null;
  };
  /** Share of frames slower than 33.3 ms (0..1). */
  slowFrameShare: number | null;
  framesOver33ms: number;
  framesOver50ms: number;
  /** Missed display refreshes, Σ max(0, round(delta / refresh) − 1); null without a refresh rate. */
  droppedFramesEst: number | null;
}

/** Linear-interpolation percentile of an ascending array; null when empty. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (rank - lo);
}

/** Median of any array; null when empty. */
export function median(values: ArrayLike<number>): number | null {
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  return percentileSorted(sorted, 50);
}

const toFps = (ms: number | null): number | null => (ms !== null && ms > 0 ? 1000 / ms : null);

export function summarizeFrames(
  deltas: ArrayLike<number>,
  refreshIntervalMs: number | null = null,
): FrameSummary {
  const sorted = Float64Array.from(deltas as ArrayLike<number>).sort();
  const n = sorted.length;
  let sum = 0;
  let over33 = 0;
  let over50 = 0;
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const d = sorted[i] ?? 0;
    sum += d;
    if (d > SLOW_FRAME_MS) over33++;
    if (d > HITCH_FRAME_MS) over50++;
    if (refreshIntervalMs !== null && refreshIntervalMs > 0) {
      dropped += Math.max(0, Math.round(d / refreshIntervalMs) - 1);
    }
  }
  const mean = n > 0 ? sum / n : null;
  const p50 = percentileSorted(sorted, 50);
  const p95 = percentileSorted(sorted, 95);
  const p99 = percentileSorted(sorted, 99);
  return {
    frames: n,
    durationMs: sum,
    fps: { median: toFps(p50), p5: toFps(p95), p1: toFps(p99), mean: toFps(mean) },
    frameTimeMs: { p50, p95, p99, max: n > 0 ? (sorted[n - 1] ?? null) : null, mean },
    slowFrameShare: n > 0 ? over33 / n : null,
    framesOver33ms: over33,
    framesOver50ms: over50,
    droppedFramesEst: refreshIntervalMs !== null && refreshIntervalMs > 0 ? dropped : null,
  };
}

/**
 * Display refresh interval from an idle rAF sample: the median delta, snapped to a common
 * refresh rate when within 3 % of one. Null when there are too few frames.
 */
export function estimateRefreshInterval(deltas: ArrayLike<number>): number | null {
  if (deltas.length < 10) return null;
  const m = median(deltas);
  if (m === null || m <= 0) return null;
  const hz = 1000 / m;
  for (const common of [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240]) {
    if (Math.abs(hz - common) / common < 0.03) return 1000 / common;
  }
  return m;
}

/**
 * Rolling window over the most recent frame deltas, for the live HUD: keeps the deltas of the
 * last `windowMs` (by accumulated frame time) plus session totals.
 */
export class RollingFrameWindow {
  private readonly windowMs: number;
  private readonly deltas: number[] = [];
  private windowSum = 0;
  private totalFrames = 0;
  private totalOver33 = 0;
  private totalOver50 = 0;

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  push(delta: number): void {
    this.deltas.push(delta);
    this.windowSum += delta;
    while (this.deltas.length > 1 && this.windowSum - (this.deltas[0] ?? 0) >= this.windowMs) {
      this.windowSum -= this.deltas.shift() ?? 0;
    }
    this.totalFrames++;
    if (delta > SLOW_FRAME_MS) this.totalOver33++;
    if (delta > HITCH_FRAME_MS) this.totalOver50++;
  }

  /** FPS over the last `recentMs` of frames (the "current" readout). */
  recentFps(recentMs = 500): number | null {
    let sum = 0;
    let count = 0;
    for (let i = this.deltas.length - 1; i >= 0 && sum < recentMs; i--) {
      sum += this.deltas[i] ?? 0;
      count++;
    }
    return count > 0 && sum > 0 ? (1000 * count) / sum : null;
  }

  snapshot(refreshIntervalMs: number | null = null) {
    return {
      currentFps: this.recentFps(),
      window: summarizeFrames(this.deltas, refreshIntervalMs),
      windowMs: this.windowMs,
      totals: {
        frames: this.totalFrames,
        over33ms: this.totalOver33,
        over50ms: this.totalOver50,
      },
    };
  }

  reset(): void {
    this.deltas.length = 0;
    this.windowSum = 0;
    this.totalFrames = 0;
    this.totalOver33 = 0;
    this.totalOver50 = 0;
  }
}
