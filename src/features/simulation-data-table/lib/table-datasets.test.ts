import { describe, expect, it } from "vitest";
import type { RoundAggregate } from "@/entities/simulation";
import type { ResultAgent, TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import {
  agentSortKey,
  buildAgentRows,
  buildAgentRowsFromResults,
  buildNetworkRows,
  buildRoundRows,
  computeDegrees,
  computeFinalSpread,
  filterAgentRows,
  filterNetworkRows,
  networkSortKey,
  paginate,
  roundSortKey,
  sortRows,
} from "./table-datasets";

const TOPOLOGY: TopologyResponse = {
  runId: "run-1",
  networkId: "net-1",
  agentCount: 3,
  edgeCount: 4,
  agentOffset: 0,
  agentLimit: 100,
  edgeOffset: 0,
  edgeLimit: 100,
  agents: [
    {
      index: 0,
      name: "alice",
      initialBelief: 0.5,
      toleranceRadius: 0.1,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    },
    {
      index: 1,
      name: null,
      initialBelief: 0.2,
      toleranceRadius: 0.1,
      toleranceOffset: 0,
      silenceStrategy: 2,
      silenceEffect: 1,
    },
    {
      index: 2,
      name: "carol",
      initialBelief: 0.9,
      toleranceRadius: 0.1,
      toleranceOffset: 0,
      silenceStrategy: 3,
      silenceEffect: 2,
    },
  ],
  edges: [
    { source: 0, target: 0, influence: 0.5, bias: 0 }, // self-loop — excluded
    { source: 0, target: 1, influence: 0.5, bias: 0 },
    { source: 1, target: 2, influence: 0.3, bias: 0 },
    { source: 2, target: 1, influence: 0.2, bias: 0 },
  ],
};

const FRAME: MergedFrame = {
  runId: "run-1",
  networkId: "net-1",
  round: 7,
  publicBelief: new Float32Array([0.4, 0.6, 0.8]),
  privateBelief: new Float32Array([0.5, 0.3, 0.8]),
  speaking: new Uint8Array([1, 0, 1]),
};

describe("computeDegrees", () => {
  it("counts in/out per agent excluding self-loops", () => {
    const degrees = computeDegrees(TOPOLOGY);
    expect(degrees.outDegree.get(0)).toBe(1); // self-loop dropped
    expect(degrees.inDegree.get(0)).toBeUndefined();
    expect(degrees.inDegree.get(1)).toBe(2);
    expect(degrees.outDegree.get(1)).toBe(1);
    expect(degrees.inDegree.get(2)).toBe(1);
  });
});

describe("buildAgentRows", () => {
  const degrees = computeDegrees(TOPOLOGY);

  it("reads beliefs, divergence and speaking from the viewed frame", () => {
    const rows = buildAgentRows(TOPOLOGY, FRAME, degrees);
    expect(rows).toHaveLength(3);
    expect(rows[1]?.publicBelief).toBeCloseTo(0.6, 4);
    expect(rows[1]?.privateBelief).toBeCloseTo(0.3, 4);
    expect(rows[1]?.divergence).toBeCloseTo(0.3, 4);
    expect(rows[1]?.speaking).toBe(false);
    expect(rows[0]?.speaking).toBe(true);
    expect(rows[0]?.name).toBe("alice");
    expect(rows[1]?.degreeIn).toBe(2);
  });

  it("falls back to initial beliefs without a frame", () => {
    const rows = buildAgentRows(TOPOLOGY, null, degrees);
    expect(rows[0]?.publicBelief).toBe(0.5);
    expect(rows[0]?.speaking).toBeNull();
  });
});

describe("buildAgentRowsFromResults (limited viewer)", () => {
  it("maps finalBelief→private, publicBelief→public, speaking unknown", () => {
    const results: ResultAgent[] = [
      { index: 0, name: "alice", finalBelief: 0.7, publicBelief: 0.65 },
      { index: 1, name: null, finalBelief: 0.1, publicBelief: 0.2 },
      { index: 2, name: "carol", finalBelief: 0.9, publicBelief: 0.9 },
    ];
    const rows = buildAgentRowsFromResults(TOPOLOGY, results, computeDegrees(TOPOLOGY));
    expect(rows[0]?.publicBelief).toBe(0.65);
    expect(rows[0]?.privateBelief).toBe(0.7);
    expect(rows[0]?.divergence).toBeCloseTo(0.05, 5);
    expect(rows[0]?.speaking).toBeNull();
  });
});

describe("buildRoundRows", () => {
  it("emits one row per defined round up to the received prefix", () => {
    const agg = (m: number): RoundAggregate => ({
      meanPublic: m,
      meanPrivate: m,
      spread: 0.1,
      participation: 0.9,
    });
    const rows = buildRoundRows([agg(0.5), undefined, agg(0.6), agg(0.7)], 2);
    expect(rows.map((r) => r.round)).toEqual([0, 2]);
    expect(rows[1]?.meanPublic).toBe(0.6);
  });
});

describe("buildNetworkRows / computeFinalSpread", () => {
  it("keeps listNetworks order with 1-based ordinals and pending → null", () => {
    const rows = buildNetworkRows(
      ["n1", "n2", "n3"],
      {
        n1: { status: "consensus", finalRound: 12 },
        n2: { status: "pending", finalRound: null },
      },
      { n1: 0.02 },
    );
    expect(rows[0]).toEqual({
      ordinal: 1,
      networkId: "n1",
      consensus: true,
      finalRound: 12,
      finalSpread: 0.02,
    });
    expect(rows[1]?.consensus).toBeNull();
    expect(rows[2]?.consensus).toBeNull();
    expect(rows[1]?.finalSpread).toBeNull();
  });

  it("computes final spread as max−min of finalBelief", () => {
    expect(
      computeFinalSpread([
        { index: 0, name: null, finalBelief: 0.2, publicBelief: 0 },
        { index: 1, name: null, finalBelief: 0.9, publicBelief: 0 },
      ]),
    ).toBeCloseTo(0.7, 5);
    expect(computeFinalSpread([])).toBeNull();
  });
});

describe("filters + sort + pagination", () => {
  const degrees = computeDegrees(TOPOLOGY);
  const rows = buildAgentRows(TOPOLOGY, FRAME, degrees);

  it("filters agents by speaking state", () => {
    expect(filterAgentRows(rows, "speaking").map((r) => r.index)).toEqual([0, 2]);
    expect(filterAgentRows(rows, "silent").map((r) => r.index)).toEqual([1]);
    expect(filterAgentRows(rows, "all")).toHaveLength(3);
  });

  it("filters networks by verdict, leaving pending out of both", () => {
    const networkRows = buildNetworkRows(
      ["n1", "n2", "n3"],
      {
        n1: { status: "consensus", finalRound: 1 },
        n2: { status: "no-consensus", finalRound: 5 },
      },
      {},
    );
    expect(filterNetworkRows(networkRows, "consensus")).toHaveLength(1);
    expect(filterNetworkRows(networkRows, "no-consensus")).toHaveLength(1);
    expect(filterNetworkRows(networkRows, "all")).toHaveLength(3);
  });

  it("sorts by numeric column in both directions", () => {
    const byPublicAsc = sortRows(rows, agentSortKey, 4, "asc").map((r) => r.index);
    expect(byPublicAsc).toEqual([0, 1, 2]);
    const byPublicDesc = sortRows(rows, agentSortKey, 4, "desc").map((r) => r.index);
    expect(byPublicDesc).toEqual([2, 1, 0]);
  });

  it("sorts by name treating null as empty string", () => {
    const byName = sortRows(rows, agentSortKey, 1, "asc").map((r) => r.name);
    expect(byName).toEqual([null, "alice", "carol"]);
  });

  it("network sort places pending verdicts first ascending", () => {
    const networkRows = buildNetworkRows(
      ["n1", "n2"],
      { n1: { status: "consensus", finalRound: 1 } },
      {},
    );
    const sorted = sortRows(networkRows, networkSortKey, 1, "asc");
    expect(sorted[0]?.networkId).toBe("n2");
  });

  it("paginate clamps the requested page and computes slice bounds", () => {
    expect(paginate(120, 0, 50)).toEqual({ page: 0, pages: 3, from: 0, to: 50 });
    expect(paginate(120, 2, 50)).toEqual({ page: 2, pages: 3, from: 100, to: 120 });
    expect(paginate(120, 99, 50).page).toBe(2);
    expect(paginate(0, 0, 25)).toEqual({ page: 0, pages: 1, from: 0, to: 0 });
  });

  it("agentSortKey covers every column, with unknown speaking sorted first", () => {
    const row = rows[1];
    if (!row) throw new Error("fixture row missing");
    expect(agentSortKey(row, 0)).toBe(1);
    expect(agentSortKey(row, 1)).toBe(""); // null name → empty string
    expect(agentSortKey(row, 2)).toBe(2);
    expect(agentSortKey(row, 3)).toBe(1);
    expect(agentSortKey(row, 4)).toBeCloseTo(0.6, 4);
    expect(agentSortKey(row, 5)).toBeCloseTo(0.3, 4);
    expect(agentSortKey(row, 6)).toBeCloseTo(0.3, 4);
    expect(agentSortKey(row, 7)).toBe(0); // silent
    expect(agentSortKey({ ...row, speaking: true }, 7)).toBe(1);
    expect(agentSortKey({ ...row, speaking: null }, 7)).toBe(-1);
    expect(agentSortKey(row, 8)).toBe(2);
    expect(agentSortKey(row, 9)).toBe(1);
  });

  it("roundSortKey covers every column", () => {
    const row = {
      round: 7,
      meanPublic: 0.1,
      meanPrivate: 0.2,
      spread: 0.3,
      participation: 0.4,
    };
    expect([0, 1, 2, 3, 4].map((col) => roundSortKey(row, col))).toEqual([7, 0.1, 0.2, 0.3, 0.4]);
  });

  it("networkSortKey covers every column, with pending values sorted first", () => {
    const resolved = {
      ordinal: 2,
      networkId: "n2",
      consensus: true,
      finalRound: 12,
      finalSpread: 0.5,
    };
    expect([0, 1, 2, 3].map((col) => networkSortKey(resolved, col))).toEqual([2, 1, 12, 0.5]);

    const pending = {
      ordinal: 3,
      networkId: "n3",
      consensus: null,
      finalRound: null,
      finalSpread: null,
    };
    expect([1, 2, 3].map((col) => networkSortKey(pending, col))).toEqual([-1, -1, -1]);
    expect(networkSortKey({ ...pending, consensus: false }, 1)).toBe(0);
  });

  it("sortRows keeps ties stable (equal keys return 0)", () => {
    const tied = [rows[0], rows[1], rows[2]].filter((r) => r !== undefined);
    const sorted = sortRows(tied, () => 1, 0, "desc");
    expect(sorted.map((r) => r.index)).toEqual(tied.map((r) => r.index));
  });
});
