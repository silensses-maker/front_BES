import { describe, expect, it } from "vitest";
import { rebalanceCounts } from "./rebalance";

interface Row {
  count: number;
  // extra prop so we can verify identity preservation
  label: string;
}

const rows = (counts: number[]): Row[] => counts.map((c, i) => ({ count: c, label: `r${i}` }));

describe("rebalanceCounts", () => {
  it("returns rows unchanged when totals already match", () => {
    const input = rows([10, 20, 30]);
    const result = rebalanceCounts(input, 60);
    expect(result).toBe(input);
  });

  it("returns empty array unchanged", () => {
    expect(rebalanceCounts([], 100)).toEqual([]);
  });

  it("scales proportionally when oldTotal > 0 and newTotal differs", () => {
    const result = rebalanceCounts(rows([10, 20, 70]), 200);
    // min=1 reserved per row, surplus 197 distributed proportionally over old
    // surplus 97: 9/97 → 18, 19/97 → 39, last absorbs rounding → 1+(197-57)=141.
    expect(result.map((r) => r.count)).toEqual([19, 40, 141]);
    expect(result.reduce((s, r) => s + r.count, 0)).toBe(200);
  });

  it("enforces min=1 per row when oldTotal>0 includes a zero row", () => {
    // [10, 0] → 5 must give [4, 1] (not [5, 0] which would break schema).
    const result = rebalanceCounts(rows([10, 0]), 5);
    expect(result.map((r) => r.count)).toEqual([4, 1]);
  });

  it("enforces min=1 when scaling down to total === rows.length", () => {
    // [8, 2] → 2 = exact min; surplus = 0, all rows get 1.
    const result = rebalanceCounts(rows([8, 2]), 2);
    expect(result.map((r) => r.count)).toEqual([1, 1]);
  });

  it("avoids zero rows when scaling [8, 2] down to 5", () => {
    const result = rebalanceCounts(rows([8, 2]), 5);
    // surplus = 3, oldDeltas = [7, 1], oldSurplus = 8.
    // row 0: round(7*3/8)=round(2.625)=3 → count 4. assigned=3.
    // row 1 (last): 1 + max(0, 3-3) = 1.
    expect(result.map((r) => r.count)).toEqual([4, 1]);
  });

  it("absorbs rounding error in the last row", () => {
    // 10 → 33.33, 10 → 33.33, 10 → 33.33; round=33,33; last gets 100 - 66 = 34.
    const result = rebalanceCounts(rows([10, 10, 10]), 100);
    expect(result.map((r) => r.count)).toEqual([33, 33, 34]);
  });

  it("distributes evenly when oldTotal is 0 and newTotal >= rows.length", () => {
    const result = rebalanceCounts(rows([0, 0, 0]), 10);
    // 10 / 3 = 3 base, remainder 1 → first row gets +1.
    expect(result.map((r) => r.count)).toEqual([4, 3, 3]);
  });

  it("spreads surplus evenly when oldSurplus is 0 but oldTotal > 0 (all rows already at floor)", () => {
    // Every row already at count=1, so oldDeltas (count - 1) are all 0 even
    // though oldTotal=3 (the oldTotal===0 branch above is NOT taken here).
    // Falls back to the same even-split logic as the oldTotal===0 case.
    const result = rebalanceCounts(rows([1, 1, 1]), 10);
    // surplus = 10 - 3 = 7; 7/3 = 2 base, remainder 1 → first row gets +1.
    expect(result.map((r) => r.count)).toEqual([4, 3, 3]);
    expect(result.reduce((s, r) => s + r.count, 0)).toBe(10);
  });

  it("scatters 1s across first `newTotal` rows when oldTotal=0 and newTotal < rows.length", () => {
    const result = rebalanceCounts(rows([0, 0, 0, 0, 0]), 2);
    expect(result.map((r) => r.count)).toEqual([1, 1, 0, 0, 0]);
  });

  it("zeroes all rows when newTotal is 0", () => {
    const result = rebalanceCounts(rows([10, 20]), 0);
    expect(result.map((r) => r.count)).toEqual([0, 0]);
  });

  it("clamps negative or fractional newTotal to floor and zero", () => {
    expect(rebalanceCounts(rows([10, 20]), -5).map((r) => r.count)).toEqual([0, 0]);
    expect(rebalanceCounts(rows([10, 20]), 12.7).map((r) => r.count)).toEqual([4, 8]);
  });

  it("preserves non-count fields", () => {
    const result = rebalanceCounts(rows([10, 20]), 60);
    expect(result.map((r) => r.label)).toEqual(["r0", "r1"]);
  });

  it("scaling down: 100→10 distribution", () => {
    const result = rebalanceCounts(rows([50, 30, 20]), 10);
    // 50/100*10=5, 30/100*10=3, last = 10-5-3 = 2.
    expect(result.map((r) => r.count)).toEqual([5, 3, 2]);
  });
});
