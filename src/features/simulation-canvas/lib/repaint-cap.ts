/**
 * Adaptive cap of the canvas repaint rate (#142): a safety net for machines where even the direct
 * repaint (buffer build + push to cosmos.gl) cannot keep up with the playback.
 *
 * Policy:
 * - Each direct repaint is timed (`performance.now()` around the buffer build and the push); the
 *   typical cost is the median of the last {@link REPAINT_CAP_WINDOW} repaints, so a single slow
 *   repaint (a GC pause, a first upload) does not count.
 * - The cap engages once {@link REPAINT_CAP_MIN_SAMPLES} repaints were measured and the typical
 *   cost exceeds {@link REPAINT_CAP_BUDGET_MS} (half a 60 Hz frame); it releases when it falls
 *   below {@link REPAINT_CAP_RELEASE_MS} (hysteresis, so it does not flap).
 * - While engaged, and only while rounds auto-advance (playback, live follow), a new round is
 *   painted only when `typical cost / REPAINT_CAP_SHARE` ms passed since the last paint — repaints
 *   then take at most that share of the main thread. A round that comes sooner is skipped on the
 *   canvas only; the latest round is painted as soon as the interval ends (trailing repaint).
 * - Anything that is not auto-advance paints at once: seeks, manual steps, the end of playback,
 *   colour-mode changes, a new network.
 * The simulation store, the timeline and the charts are never capped. When repaints are cheap
 * (the expected case) the cap never engages and nothing changes.
 */

/** Average repaint cost above which the cap engages (ms). */
export const REPAINT_CAP_BUDGET_MS = 8;
/** Average repaint cost below which an engaged cap releases (ms). */
export const REPAINT_CAP_RELEASE_MS = 6;
/** Repaints measured before the cap may engage ("consistently" over budget). */
export const REPAINT_CAP_MIN_SAMPLES = 5;
/** Repaints the typical cost is the median of. */
export const REPAINT_CAP_WINDOW = 8;
/** Largest share of the main thread capped repaints may take. */
export const REPAINT_CAP_SHARE = 0.5;

export interface RepaintCapState {
  /** Costs of the last {@link REPAINT_CAP_WINDOW} repaints (ms), oldest first. */
  recentMs: readonly number[];
  /** Typical repaint cost: the median of `recentMs`; null before the first repaint. */
  typicalMs: number | null;
  /** Repaints measured. */
  samples: number;
  engaged: boolean;
  /** `performance.now()` of the last paint; null before the first. */
  lastPaintAt: number | null;
}

export const INITIAL_REPAINT_CAP: RepaintCapState = {
  recentMs: [],
  typicalMs: null,
  samples: 0,
  engaged: false,
  lastPaintAt: null,
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

/** Folds one measured repaint (`costMs`, painted at `at`) into the state. */
export function recordRepaintCost(
  state: RepaintCapState,
  costMs: number,
  at: number,
): RepaintCapState {
  const cost = Number.isFinite(costMs) && costMs > 0 ? costMs : 0;
  const recentMs = [...state.recentMs, cost].slice(-REPAINT_CAP_WINDOW);
  const typicalMs = median(recentMs);
  const samples = state.samples + 1;
  let engaged = state.engaged;
  if (!engaged && samples >= REPAINT_CAP_MIN_SAMPLES && typicalMs > REPAINT_CAP_BUDGET_MS) {
    engaged = true;
  } else if (engaged && typicalMs < REPAINT_CAP_RELEASE_MS) {
    engaged = false;
  }
  return { recentMs, typicalMs, samples, engaged, lastPaintAt: at };
}

/** Minimum time between capped repaints (ms); 0 while the cap is not engaged. */
export function repaintIntervalMs(state: RepaintCapState): number {
  if (!state.engaged || state.typicalMs === null) return 0;
  return state.typicalMs / REPAINT_CAP_SHARE;
}

export type RepaintDecision = { paint: true } | { paint: false; retryInMs: number };

/** Whether a new round shown at `now` is painted now or skipped (and retried after `retryInMs`). */
export function decideRepaint(
  state: RepaintCapState,
  now: number,
  autoAdvancing: boolean,
): RepaintDecision {
  const interval = repaintIntervalMs(state);
  if (!autoAdvancing || interval === 0 || state.lastPaintAt === null) return { paint: true };
  const wait = state.lastPaintAt + interval - now;
  return wait <= 0 ? { paint: true } : { paint: false, retryInMs: wait };
}
