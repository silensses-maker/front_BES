import { describe, expect, it } from "vitest";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { computeRoundAggregate, sampleAgentIndices, thinSeries } from "./round-aggregates";

function makeFrame(
  round: number,
  publicBelief: number[],
  privateBelief: number[],
  speaking: number[],
): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(publicBelief),
    privateBelief: new Float32Array(privateBelief),
    speaking: new Uint8Array(speaking),
  };
}

describe("computeRoundAggregate", () => {
  it("computes means over public and private beliefs", () => {
    const agg = computeRoundAggregate(makeFrame(3, [0.2, 0.4], [0.6, 0.8], [1, 1]));
    expect(agg.meanPublic).toBeCloseTo(0.3, 5);
    expect(agg.meanPrivate).toBeCloseTo(0.7, 5);
  });

  it("computes spread as max − min of PRIVATE beliefs", () => {
    const agg = computeRoundAggregate(makeFrame(0, [0, 1], [0.25, 0.85], [1, 0]));
    expect(agg.spread).toBeCloseTo(0.6, 5);
  });

  it("computes participation as the speaking fraction", () => {
    const agg = computeRoundAggregate(makeFrame(0, [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 1, 0]));
    expect(agg.participation).toBeCloseTo(0.5, 5);
  });

  it("returns zeros for an empty frame", () => {
    const agg = computeRoundAggregate(makeFrame(0, [], [], []));
    expect(agg).toEqual({ meanPublic: 0, meanPrivate: 0, spread: 0, participation: 0 });
  });
});

describe("sampleAgentIndices", () => {
  it("returns every index when the population fits", () => {
    expect(sampleAgentIndices(3)).toEqual([0, 1, 2]);
  });

  it("samples uniformly with a floor step when over the cap", () => {
    const indices = sampleAgentIndices(200, 50);
    expect(indices).toHaveLength(50);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(4);
    expect(indices[49]).toBe(196);
  });

  it("returns empty for zero agents", () => {
    expect(sampleAgentIndices(0)).toEqual([]);
  });
});

describe("thinSeries", () => {
  it("keeps every other point plus the last one", () => {
    const points: Array<[number, number]> = [
      [0, 0.1],
      [1, 0.2],
      [2, 0.3],
      [3, 0.4],
    ];
    expect(thinSeries(points)).toEqual([
      [0, 0.1],
      [2, 0.3],
      [3, 0.4],
    ]);
  });
});
