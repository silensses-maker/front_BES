import { describe, expect, it } from "vitest";
import {
  adjacentNetwork,
  buildNetworkEntries,
  consensusSummary,
  filterNetworkEntries,
} from "./network-browser-lib";
import type { NetworkConsensusEntry } from "./use-network-consensus";

const CONSENSUS: Record<string, NetworkConsensusEntry> = {
  n1: { status: "consensus", finalRound: 12 },
  n2: { status: "no-consensus", finalRound: 100 },
  // n3 absent → pending
};

const ENTRIES = buildNetworkEntries(["n1", "n2", "n3"], CONSENSUS);

describe("buildNetworkEntries", () => {
  it("keeps listNetworks order with 1-based ordinals; absent → pending", () => {
    expect(ENTRIES).toEqual([
      { ordinal: 1, networkId: "n1", status: "consensus", finalRound: 12 },
      { ordinal: 2, networkId: "n2", status: "no-consensus", finalRound: 100 },
      { ordinal: 3, networkId: "n3", status: "pending", finalRound: null },
    ]);
  });
});

describe("filterNetworkEntries", () => {
  it("filters by verdict; pending only shows under 'all'", () => {
    expect(filterNetworkEntries(ENTRIES, "all", "")).toHaveLength(3);
    expect(filterNetworkEntries(ENTRIES, "consensus", "").map((e) => e.networkId)).toEqual(["n1"]);
    expect(filterNetworkEntries(ENTRIES, "no-consensus", "").map((e) => e.networkId)).toEqual([
      "n2",
    ]);
  });

  it("matches the search as a numeric prefix of the 1-based ordinal", () => {
    const many = buildNetworkEntries(
      Array.from({ length: 25 }, (_, i) => `net-${i}`),
      {},
    );
    const matches = filterNetworkEntries(many, "all", "1").map((e) => e.ordinal);
    expect(matches).toEqual([1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(filterNetworkEntries(many, "all", "23").map((e) => e.ordinal)).toEqual([23]);
  });

  it("strips non-digits from the query and combines with the verdict filter", () => {
    expect(filterNetworkEntries(ENTRIES, "consensus", " 1a ").map((e) => e.ordinal)).toEqual([1]);
    expect(filterNetworkEntries(ENTRIES, "consensus", "2")).toEqual([]);
  });
});

describe("consensusSummary", () => {
  it("counts per verdict and computes pct over the TOTAL", () => {
    expect(consensusSummary(ENTRIES)).toEqual({
      consensus: 1,
      noConsensus: 1,
      pending: 1,
      total: 3,
      pct: 33,
    });
    expect(consensusSummary([])).toEqual({
      consensus: 0,
      noConsensus: 0,
      pending: 0,
      total: 0,
      pct: 0,
    });
  });
});

describe("adjacentNetwork", () => {
  it("moves through the filtered list and returns null at the edges", () => {
    expect(adjacentNetwork(ENTRIES, "n2", -1)?.networkId).toBe("n1");
    expect(adjacentNetwork(ENTRIES, "n2", 1)?.networkId).toBe("n3");
    expect(adjacentNetwork(ENTRIES, "n1", -1)).toBeNull();
    expect(adjacentNetwork(ENTRIES, "n3", 1)).toBeNull();
    expect(adjacentNetwork(ENTRIES, "missing", 1)).toBeNull();
  });
});
