import { describe, expect, it } from "vitest";
import type { BenchProbeEvent, BenchProbeName } from "@/shared/lib/bench-probe";
import { makeRecording } from "./frame-recorder";
import { chooseWindowStart } from "./layout-window";
import { distribution, toLeadWindow } from "./phase-result";
import { computeRepaintBreakdown } from "./repaint-breakdown";
import {
  expectedEdgeCount,
  generateSyntheticTopology,
  keepOneLinkPerPair,
} from "./synthetic-topology";

const ev = (name: BenchProbeName, at: number, detail: BenchProbeEvent["detail"] = {}) => ({
  name,
  at,
  detail,
});

describe("chooseWindowStart", () => {
  const data = ["cosmograph-graph-rebuilt"] as const;

  it("starts at the first tick after the last data event", () => {
    const events = [
      ev("canvas-layout-start", 100),
      ev("cosmograph-first-tick", 110),
      ev("cosmograph-graph-rebuilt", 900),
      ev("cosmograph-first-tick", 950),
      ev("cosmograph-first-tick", 2_000),
    ];
    expect(chooseWindowStart(events, { from: 100, to: 5_000, dataEvents: data })).toBe(950);
  });

  it("takes the first tick when no data event was seen, and null without ticks", () => {
    const ticks = [ev("cosmograph-first-tick", 300)];
    expect(chooseWindowStart(ticks, { from: 100, to: 5_000, dataEvents: data })).toBe(300);
    expect(chooseWindowStart(ticks, { from: 400, to: 5_000, dataEvents: data })).toBeNull();
    const late = [ev("cosmograph-graph-rebuilt", 900), ev("cosmograph-first-tick", 6_000)];
    expect(chooseWindowStart(late, { from: 100, to: 5_000, dataEvents: data })).toBeNull();
  });

  it("follows cluster updates for a grouping change", () => {
    const events = [
      ev("cosmograph-first-tick", 1_050),
      ev("cosmograph-clusters-updated", 1_400),
      ev("cosmograph-first-tick", 1_420),
    ];
    expect(
      chooseWindowStart(events, {
        from: 1_000,
        to: 5_000,
        dataEvents: ["cosmograph-clusters-updated", "cosmograph-graph-rebuilt"],
      }),
    ).toBe(1_420);
  });
});

describe("toLeadWindow and distribution", () => {
  it("summarizes the excluded interval", () => {
    const lead = makeRecording(0, 900, [10, 20, 820], [{ startTime: 30, duration: 780 }], true, []);
    expect(toLeadWindow("upload", lead, "first-tick")).toEqual({
      label: "upload",
      durationMs: 900,
      startedBy: "first-tick",
      frames: 3,
      maxFrameMs: 800,
      longTasks: { supported: true, count: 1, totalMs: 780, maxMs: 780 },
    });
    expect(
      toLeadWindow("cluster-update", makeRecording(5, 5, [], [], false, []), "fallback"),
    ).toMatchObject({ durationMs: 0, frames: 0, maxFrameMs: null });
  });

  it("computes median, p95 and mean", () => {
    expect(distribution([])).toEqual({ median: null, p95: null, mean: null });
    const d = distribution([4, 1, 3, 2]);
    expect(d.median).toBe(2.5);
    expect(d.p95).toBeCloseTo(3.85);
    expect(d.mean).toBe(2.5);
  });
});

describe("computeRepaintBreakdown", () => {
  it("matches commits to their rounds and summarizes the Cosmograph updates", () => {
    const rounds = [
      { round: 3, showAt: 1_000, mergeMs: 1 },
      { round: 4, showAt: 1_100, mergeMs: 3 },
      { round: 5, showAt: 1_200, mergeMs: 2 },
    ];
    const events = [
      ev("canvas-frame-commit", 990, { round: 3 }), // an earlier commit of the same round
      ev("canvas-frame-commit", 1_004, { round: 3 }),
      ev("canvas-frame-commit", 1_106, { round: 4 }),
      ev("cosmograph-config-done", 1_080, { durationMs: 70, syncMs: 5 }),
      ev("cosmograph-config-done", 1_190, { durationMs: 80, syncMs: 7 }),
      ev("cosmograph-colors-updated", 1_079),
      ev("cosmograph-colors-updated", 1_189),
      ev("cosmograph-config-done", 3_000, { durationMs: 999, syncMs: 9 }), // after the window
    ];
    const b = computeRepaintBreakdown({
      rounds,
      events,
      windowStart: 1_000,
      windowEnd: 2_000,
      frameMs: 100,
      longTaskMs: 400,
    });
    expect(b.rounds).toBe(3);
    expect(b.mergeMs.median).toBe(2);
    expect(b.commitMs.median).toBe(5);
    expect(b.commitMs.p95).toBeCloseTo(5.9);
    expect(b.commitMs.mean).toBe(5);
    expect(b.cosmographUpdates).toBe(2);
    expect(b.cosmographUpdateMs.median).toBe(75);
    expect(b.cosmographSyncMs.mean).toBe(6);
    expect(b.colorUpdates).toBe(2);
    expect(b.frameMs).toBe(100);
    expect(b.longTaskMsPerSecond).toBe(400);
    expect(
      computeRepaintBreakdown({
        rounds: [],
        events: [],
        windowStart: 0,
        windowEnd: 0,
        frameMs: null,
        longTaskMs: null,
      }).longTaskMsPerSecond,
    ).toBeNull();
  });
});

describe("keepOneLinkPerPair", () => {
  it("halves a generated network (every attachment is stored both ways)", () => {
    const full = generateSyntheticTopology({
      agents: 400,
      density: 3,
      seed: 1,
      runId: "1",
      networkId: "00000126-0000-4000-8000-000000000001",
    });
    const pairs = keepOneLinkPerPair(full);
    expect(full.edges).toHaveLength(expectedEdgeCount(400, 3));
    expect(pairs.edges).toHaveLength(full.edges.length / 2);
    expect(pairs.edgeCount).toBe(pairs.edges.length);
    expect(pairs.edgeLimit).toBe(pairs.edges.length);
    const keys = new Set(
      pairs.edges.map((e) => `${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`),
    );
    expect(keys.size).toBe(pairs.edges.length);
    expect(pairs.agents).toBe(full.agents);
  });
});
