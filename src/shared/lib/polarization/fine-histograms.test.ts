import { describe, expect, it } from "vitest";
import { FINE_BINS } from "./binning";
import { FineHistogramPool } from "./fine-histograms";

function histogram(entries: Record<number, number>): Uint32Array {
  const out = new Uint32Array(FINE_BINS);
  for (const [bin, count] of Object.entries(entries)) out[Number(bin)] = count;
  return out;
}

describe("FineHistogramPool", () => {
  it("records both belief types per round and reads them back", () => {
    const pool = new FineHistogramPool();
    pool.record(3, histogram({ 0: 2, 209: 2 }), histogram({ 105: 4 }));

    expect(pool.has(3)).toBe(true);
    expect(pool.has(2)).toBe(false);
    expect(pool.has(-1)).toBe(false);
    expect(pool.size).toBe(1);
    expect(pool.fine(3, "public")?.[0]).toBe(2);
    expect(pool.fine(3, "public")?.[209]).toBe(2);
    expect(pool.fine(3, "private")?.[105]).toBe(4);
    expect(pool.fine(2, "public")).toBeNull();
  });

  it("returns k-category weights and the agent count", () => {
    const pool = new FineHistogramPool();
    pool.record(0, histogram({ 0: 2, 209: 2 }), histogram({ 105: 4 }));
    const out = new Float64Array(5);

    expect(pool.categoryWeights(0, "public", 5, out)).toBe(4);
    expect(Array.from(out)).toEqual([0.5, 0, 0, 0, 0.5]);
    expect(pool.categoryWeights(0, "private", 5, out)).toBe(4);
    expect(Array.from(out)).toEqual([0, 0, 1, 0, 0]);
    expect(pool.categoryWeights(9, "private", 5, out)).toBe(0);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0]);
  });

  it("records a round once, accepts any order and logs arrivals", () => {
    const pool = new FineHistogramPool();
    pool.record(5, histogram({ 1: 1 }), histogram({ 1: 1 }));
    pool.record(2, histogram({ 2: 1 }), histogram({ 2: 1 }));
    pool.record(5, histogram({ 9: 9 }), histogram({ 9: 9 }));
    pool.record(-1, histogram({ 9: 9 }), histogram({ 9: 9 }));

    expect(pool.size).toBe(2);
    expect(Array.from(pool.log.subarray(0, pool.size))).toEqual([5, 2]);
    expect(pool.fine(5, "public")?.[1]).toBe(1);
    expect(pool.fine(5, "public")?.[9]).toBe(0);
  });

  it("grows past its initial capacity, keeping earlier rounds", () => {
    const pool = new FineHistogramPool();
    const before = pool.byteLength;
    for (let round = 0; round < 300; round++) {
      pool.record(round, histogram({ [round % FINE_BINS]: 1 }), histogram({ 0: round }));
    }
    expect(pool.size).toBe(300);
    expect(pool.byteLength).toBeGreaterThan(before);
    expect(pool.fine(0, "private")?.[0]).toBe(0);
    expect(pool.fine(299, "private")?.[0]).toBe(299);
    expect(pool.fine(250, "public")?.[250 % FINE_BINS]).toBe(1);
  });

  it("switches to 32-bit counts when a bin exceeds 65 535 agents", () => {
    const pool = new FineHistogramPool();
    pool.record(0, histogram({ 0: 10 }), histogram({ 0: 10 }));
    pool.record(1, histogram({ 3: 70_000 }), histogram({ 4: 1 }));
    pool.record(200, histogram({ 5: 1 }), histogram({ 6: 80_000 }));

    expect(pool.fine(1, "public")).toBeInstanceOf(Uint32Array);
    expect(pool.fine(1, "public")?.[3]).toBe(70_000);
    expect(pool.fine(0, "public")?.[0]).toBe(10);
    expect(pool.fine(200, "private")?.[6]).toBe(80_000);
  });
});
