import { describe, expect, it } from "vitest";
import {
  decideRepaint,
  INITIAL_REPAINT_CAP,
  REPAINT_CAP_BUDGET_MS,
  REPAINT_CAP_MIN_SAMPLES,
  REPAINT_CAP_SHARE,
  REPAINT_CAP_WINDOW,
  type RepaintCapState,
  recordRepaintCost,
  repaintIntervalMs,
} from "./repaint-cap";

/** Records `n` repaints of `costMs`, one every 16 ms from `start`. */
function feed(state: RepaintCapState, costMs: number, n: number, start = 0): RepaintCapState {
  let s = state;
  for (let i = 0; i < n; i++) s = recordRepaintCost(s, costMs, start + i * 16);
  return s;
}

describe("recordRepaintCost", () => {
  it("takes the median of the recent repaints as the typical cost", () => {
    const one = recordRepaintCost(INITIAL_REPAINT_CAP, 10, 5);
    expect(one).toEqual({
      recentMs: [10],
      typicalMs: 10,
      samples: 1,
      engaged: false,
      lastPaintAt: 5,
    });
    expect(recordRepaintCost(one, 20, 6).typicalMs).toBe(15);
    expect(recordRepaintCost(recordRepaintCost(one, 20, 6), 1, 7).typicalMs).toBe(10);
  });

  it("keeps only the last window of repaints", () => {
    const s = feed(feed(INITIAL_REPAINT_CAP, 50, 20), 1, REPAINT_CAP_WINDOW);
    expect(s.recentMs).toHaveLength(REPAINT_CAP_WINDOW);
    expect(s.typicalMs).toBe(1);
    expect(s.samples).toBe(20 + REPAINT_CAP_WINDOW);
  });

  it("treats invalid costs as zero", () => {
    expect(recordRepaintCost(INITIAL_REPAINT_CAP, Number.NaN, 0).typicalMs).toBe(0);
    expect(recordRepaintCost(INITIAL_REPAINT_CAP, -3, 0).typicalMs).toBe(0);
  });

  it("stays off while repaints are within budget (the expected case)", () => {
    const s = feed(INITIAL_REPAINT_CAP, 3, 200);
    expect(s.engaged).toBe(false);
    expect(repaintIntervalMs(s)).toBe(0);
  });

  it("needs a few slow repaints before it engages", () => {
    const slow = REPAINT_CAP_BUDGET_MS * 3;
    expect(feed(INITIAL_REPAINT_CAP, slow, REPAINT_CAP_MIN_SAMPLES - 1).engaged).toBe(false);
    expect(feed(INITIAL_REPAINT_CAP, slow, REPAINT_CAP_MIN_SAMPLES).engaged).toBe(true);
  });

  it("ignores a few slow repaints among fast ones", () => {
    let s = feed(INITIAL_REPAINT_CAP, 2, 10);
    s = feed(s, 40, 3, 200);
    expect(s.engaged).toBe(false);
  });

  it("releases with hysteresis once repaints are cheap again", () => {
    let s = feed(INITIAL_REPAINT_CAP, 20, 10);
    expect(s.engaged).toBe(true);
    // between release and budget: stays engaged
    s = feed(s, 7, 10);
    expect(s.engaged).toBe(true);
    s = feed(s, 1, 20);
    expect(s.engaged).toBe(false);
  });
});

describe("decideRepaint", () => {
  const engaged = feed(INITIAL_REPAINT_CAP, 20, 10, 0); // last paint at 144 ms, typical 20 ms

  it("spaces capped repaints by typical cost / share", () => {
    expect(repaintIntervalMs(engaged)).toBeCloseTo(20 / REPAINT_CAP_SHARE);
    const last = engaged.lastPaintAt ?? 0;
    const interval = repaintIntervalMs(engaged);
    const soon = decideRepaint(engaged, last + 5, true);
    expect(soon.paint).toBe(false);
    if (!soon.paint) expect(soon.retryInMs).toBeCloseTo(interval - 5);
    expect(decideRepaint(engaged, last + interval, true)).toEqual({ paint: true });
  });

  it("always paints when rounds do not auto-advance (seek, step, end of playback)", () => {
    expect(decideRepaint(engaged, (engaged.lastPaintAt ?? 0) + 1, false)).toEqual({ paint: true });
  });

  it("always paints while the cap is off or before the first paint", () => {
    expect(decideRepaint(feed(INITIAL_REPAINT_CAP, 1, 10), 1, true)).toEqual({ paint: true });
    expect(decideRepaint(INITIAL_REPAINT_CAP, 0, true)).toEqual({ paint: true });
    expect(decideRepaint({ ...engaged, lastPaintAt: null }, 0, true)).toEqual({ paint: true });
  });
});
