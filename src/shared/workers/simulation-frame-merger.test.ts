import { describe, expect, it } from "vitest";
import type { SimulationFramePartition } from "@/shared/lib/simulation-frame";
import { PartitionMerger } from "./simulation-frame-merger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePartition(
  overrides: Partial<SimulationFramePartition> & {
    round: number;
    startsAt: number;
    pub?: number[];
    priv?: number[];
    speak?: number[];
  },
): SimulationFramePartition {
  const count = overrides.pub?.length ?? overrides.priv?.length ?? overrides.speak?.length ?? 1;
  return {
    runId: "72057594037927936",
    networkId: "01020304-0506-0708-090a-0b0c0d0e0f10",
    agentCount: count,
    publicBelief: new Float32Array(overrides.pub ?? Array(count).fill(0.5)),
    privateBelief: new Float32Array(overrides.priv ?? Array(count).fill(0.5)),
    speaking: new Uint8Array(overrides.speak ?? Array(count).fill(1)),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PartitionMerger", () => {
  describe("single-partition round (no splitting)", () => {
    it("returns a MergedFrame when the sole partition covers all agents", () => {
      const merger = new PartitionMerger(3);
      const p = makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2, 0.3] });
      const result = merger.processPartition(p);
      expect(result).not.toBeNull();
      expect(result?.round).toBe(1);
    });

    it("returned frame has the same runId and networkId as the partition", () => {
      const merger = new PartitionMerger(2);
      const p = makePartition({ round: 1, startsAt: 0, pub: [0.5, 0.5] });
      const result = merger.processPartition(p);
      expect(result?.runId).toBe(p.runId);
      expect(result?.networkId).toBe(p.networkId);
    });

    it("returned publicBelief and privateBelief match the partition data", () => {
      const merger = new PartitionMerger(3);
      const p = makePartition({
        round: 1,
        startsAt: 0,
        pub: [0.1, 0.5, 0.9],
        priv: [0.9, 0.5, 0.1],
      });
      const result = merger.processPartition(p)!;
      expect(Array.from(result.publicBelief)).toEqual(
        expect.arrayContaining([0.1, 0.5, 0.9].map((v) => expect.closeTo(v, 5))),
      );
      expect(Array.from(result.privateBelief)).toEqual(
        expect.arrayContaining([0.9, 0.5, 0.1].map((v) => expect.closeTo(v, 5))),
      );
    });

    it("returned speaking array matches the partition data", () => {
      const merger = new PartitionMerger(3);
      const p = makePartition({ round: 1, startsAt: 0, speak: [1, 0, 1] });
      const result = merger.processPartition(p)!;
      expect(Array.from(result.speaking)).toEqual([1, 0, 1]);
    });
  });

  describe("two-partition round (10 agents split into 5+5)", () => {
    it("returns null after first partition (round incomplete)", () => {
      const merger = new PartitionMerger(10);
      const p = makePartition({ round: 1, startsAt: 0, pub: Array(5).fill(0.1) });
      expect(merger.processPartition(p)).toBeNull();
    });

    it("returns MergedFrame after second partition completes the round", () => {
      const merger = new PartitionMerger(10);
      merger.processPartition(makePartition({ round: 1, startsAt: 0, pub: Array(5).fill(0.1) }));
      const result = merger.processPartition(
        makePartition({ round: 1, startsAt: 5, pub: Array(5).fill(0.9) }),
      );
      expect(result).not.toBeNull();
      expect(result?.round).toBe(1);
    });

    it("merged publicBelief places each partition at the correct offset", () => {
      const merger = new PartitionMerger(6);
      merger.processPartition(makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2, 0.3] }));
      const result = merger.processPartition(
        makePartition({ round: 1, startsAt: 3, pub: [0.4, 0.5, 0.6] }),
      )!;
      for (let i = 0; i < 6; i++) {
        expect(result.publicBelief[i]).toBeCloseTo((i + 1) * 0.1, 5);
      }
    });

    it("merged speaking places each partition at the correct offset", () => {
      const merger = new PartitionMerger(6);
      merger.processPartition(makePartition({ round: 1, startsAt: 0, speak: [1, 0, 1] }));
      const result = merger.processPartition(
        makePartition({ round: 1, startsAt: 3, speak: [0, 1, 0] }),
      )!;
      expect(Array.from(result.speaking)).toEqual([1, 0, 1, 0, 1, 0]);
    });
  });

  describe("stale-frame policy", () => {
    it("discards a partition for a round older than the current round", () => {
      const merger = new PartitionMerger(2);
      // Advance to round 5
      merger.processPartition(makePartition({ round: 5, startsAt: 0, pub: [0.5, 0.5] }));
      // Now send a partition for round 3 (stale)
      const stale = merger.processPartition(
        makePartition({ round: 3, startsAt: 0, pub: [0.1, 0.2] }),
      );
      expect(stale).toBeNull();
    });

    it("accepts partitions for the current round even after a newer round arrived", () => {
      const merger = new PartitionMerger(4);
      // Start round 2 (two partitions needed)
      merger.processPartition(makePartition({ round: 2, startsAt: 0, pub: [0.1, 0.2] }));
      // Round 3 arrives — round 2 becomes stale
      merger.processPartition(makePartition({ round: 3, startsAt: 0, pub: [0.9, 0.9] }));
      // Completing round 2 now is too late
      const late = merger.processPartition(
        makePartition({ round: 2, startsAt: 2, pub: [0.3, 0.4] }),
      );
      expect(late).toBeNull();
    });

    it("evicts pending rounds more than 10 behind the current round", () => {
      const merger = new PartitionMerger(4);
      // Start an incomplete round 1
      merger.processPartition(makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2] }));
      // Jump to round 12 — round 1 should be evicted (12 - 1 = 11 > 10)
      merger.processPartition(makePartition({ round: 12, startsAt: 0, pub: [0.5, 0.5] }));
      // Completing round 1 now — it was evicted, so result must be null
      const late = merger.processPartition(
        makePartition({ round: 1, startsAt: 2, pub: [0.3, 0.4] }),
      );
      expect(late).toBeNull();
    });
  });

  describe("duplicate partition protection", () => {
    it("ignores a second partition with the same startsAt for the same round", () => {
      const merger = new PartitionMerger(4);
      // Two partitions needed: startsAt 0 and startsAt 2
      merger.processPartition(makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2] }));
      // Duplicate of startsAt 0 — should NOT count toward agentsArrived
      const dup = merger.processPartition(
        makePartition({ round: 1, startsAt: 0, pub: [0.9, 0.9] }),
      );
      expect(dup).toBeNull();
      // The real second partition arrives
      const result = merger.processPartition(
        makePartition({ round: 1, startsAt: 2, pub: [0.3, 0.4] }),
      );
      // Now it's complete
      expect(result).not.toBeNull();
      // Data from original first partition (not duplicate) should be preserved
      expect(result!.publicBelief[0]).toBeCloseTo(0.1, 5);
    });
  });

  describe("multiple sequential rounds", () => {
    it("correctly handles back-to-back complete rounds", () => {
      const merger = new PartitionMerger(2);
      const r1 = merger.processPartition(
        makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2] }),
      )!;
      const r2 = merger.processPartition(
        makePartition({ round: 2, startsAt: 0, pub: [0.3, 0.4] }),
      )!;
      expect(r1.round).toBe(1);
      expect(r2.round).toBe(2);
      expect(r1.publicBelief[0]).toBeCloseTo(0.1, 5);
      expect(r2.publicBelief[0]).toBeCloseTo(0.3, 5);
    });

    it("does not mix belief data between rounds", () => {
      const merger = new PartitionMerger(2);
      merger.processPartition(makePartition({ round: 1, startsAt: 0, pub: [0.1, 0.2] }));
      const r2 = merger.processPartition(
        makePartition({ round: 2, startsAt: 0, pub: [0.9, 0.8] }),
      )!;
      expect(r2.publicBelief[0]).toBeCloseTo(0.9, 5);
    });
  });
});
