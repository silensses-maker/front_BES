import { describe, expect, it } from "vitest";
import {
  estimateRefreshInterval,
  median,
  percentileSorted,
  RollingFrameWindow,
  summarizeFrames,
} from "./frame-stats";

describe("percentileSorted", () => {
  it("interpolates linearly between order statistics", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileSorted(sorted, 0)).toBe(10);
    expect(percentileSorted(sorted, 50)).toBe(30);
    expect(percentileSorted(sorted, 100)).toBe(50);
    expect(percentileSorted(sorted, 95)).toBeCloseTo(48);
    expect(percentileSorted(sorted, 150)).toBe(50);
    expect(percentileSorted([7], 99)).toBe(7);
    expect(percentileSorted([], 50)).toBeNull();
  });
});

describe("median", () => {
  it("sorts numerically", () => {
    expect(median([3, 100, 2])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("summarizeFrames", () => {
  it("reports FPS from frame-time percentiles", () => {
    const deltas = [...Array<number>(95).fill(1000 / 60), ...Array<number>(5).fill(50)];
    const s = summarizeFrames(deltas, 1000 / 60);
    expect(s.frames).toBe(100);
    expect(s.fps.median).toBeCloseTo(60);
    expect(s.fps.p1).toBeCloseTo(20);
    expect(s.fps.p5).toBeGreaterThan(20);
    expect(s.fps.p5).toBeLessThan(60);
    expect(s.frameTimeMs.max).toBe(50);
    expect(s.framesOver33ms).toBe(5);
    expect(s.framesOver50ms).toBe(0);
    expect(s.slowFrameShare).toBeCloseTo(0.05);
    // each 50 ms frame spans 3 refreshes → 2 missed
    expect(s.droppedFramesEst).toBe(10);
    expect(s.durationMs).toBeCloseTo(95 * (1000 / 60) + 250);
  });

  it("counts hitches over 50 ms and leaves the drop estimate null without a refresh rate", () => {
    const s = summarizeFrames([16, 16, 51, 120]);
    expect(s.framesOver50ms).toBe(2);
    expect(s.droppedFramesEst).toBeNull();
  });

  it("handles an empty window", () => {
    const s = summarizeFrames([]);
    expect(s.frames).toBe(0);
    expect(s.fps).toEqual({ median: null, p5: null, p1: null, mean: null });
    expect(s.frameTimeMs.max).toBeNull();
    expect(s.slowFrameShare).toBeNull();
  });
});

describe("estimateRefreshInterval", () => {
  it("snaps to a common refresh rate", () => {
    expect(estimateRefreshInterval(Array<number>(30).fill(16.9))).toBeCloseTo(1000 / 60);
    expect(estimateRefreshInterval(Array<number>(30).fill(6.95))).toBeCloseTo(1000 / 144);
  });

  it("keeps an uncommon median and needs enough frames", () => {
    expect(estimateRefreshInterval(Array<number>(30).fill(25))).toBe(25);
    expect(estimateRefreshInterval([16, 16])).toBeNull();
    expect(estimateRefreshInterval(Array<number>(20).fill(0))).toBeNull();
  });
});

describe("RollingFrameWindow", () => {
  it("keeps only the last windowMs of frames, with session totals", () => {
    const w = new RollingFrameWindow(100);
    for (let i = 0; i < 20; i++) w.push(10);
    w.push(60);
    const snap = w.snapshot();
    expect(snap.window.durationMs).toBeLessThanOrEqual(100 + 60);
    expect(snap.window.frames).toBeLessThan(21);
    expect(snap.totals).toEqual({ frames: 21, over33ms: 1, over50ms: 1 });
    expect(snap.windowMs).toBe(100);
  });

  it("reports the recent FPS and resets", () => {
    const w = new RollingFrameWindow();
    expect(w.recentFps()).toBeNull();
    for (let i = 0; i < 60; i++) w.push(1000 / 60);
    expect(w.recentFps()).toBeCloseTo(60);
    expect(w.snapshot().currentFps).toBeCloseTo(60);
    w.reset();
    expect(w.snapshot().totals.frames).toBe(0);
    expect(w.snapshot().window.frames).toBe(0);
  });
});
