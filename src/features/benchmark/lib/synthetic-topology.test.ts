import { describe, expect, it } from "vitest";
import {
  expectedEdgeCount,
  generateSyntheticTopology,
  inferDensity,
  syntheticNetworkId,
  syntheticRunId,
} from "./synthetic-topology";

const make = (agents: number, density: number, seed = 7) =>
  generateSyntheticTopology({
    agents,
    density,
    seed,
    runId: syntheticRunId(seed),
    networkId: syntheticNetworkId(seed),
  });

describe("expectedEdgeCount", () => {
  it("is the backend formula m(m−1) + (n−m)·2m", () => {
    expect(expectedEdgeCount(10, 2)).toBe(34);
    expect(expectedEdgeCount(10, 3)).toBe(48);
    expect(expectedEdgeCount(100_000, 3)).toBe(599_988);
    expect(expectedEdgeCount(3, 3)).toBe(0);
  });
});

describe("generateSyntheticTopology", () => {
  it.each([
    [10, 2],
    [10, 3],
    [500, 1],
    [2_000, 5],
  ])("n=%i, m=%i has the backend's edge count and response shape", (n, m) => {
    const t = make(n, m);
    expect(t.agents).toHaveLength(n);
    expect(t.edges).toHaveLength(expectedEdgeCount(n, m));
    expect(t.agentCount).toBe(n);
    expect(t.edgeCount).toBe(t.edges.length);
    expect(t.agentOffset).toBe(0);
    expect(t.agentLimit).toBe(n);
    expect(t.edgeLimit).toBe(t.edges.length);
    expect(t.agents.map((a) => a.index)).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it("stores every attachment in both directions, without self-loops or duplicates", () => {
    const t = make(1_000, 3);
    const keys = new Set(t.edges.map((e) => `${e.source}-${e.target}`));
    expect(keys.size).toBe(t.edges.length);
    for (const e of t.edges) {
      expect(e.source).not.toBe(e.target);
      expect(keys.has(`${e.target}-${e.source}`)).toBe(true);
    }
  });

  it("fully connects the core (agents 0..m)", () => {
    const m = 4;
    const t = make(200, m);
    const keys = new Set(t.edges.map((e) => `${e.source}-${e.target}`));
    for (let i = 0; i <= m; i++) {
      for (let j = 0; j <= m; j++) if (i !== j) expect(keys.has(`${i}-${j}`)).toBe(true);
    }
  });

  it("emits edges in CSR order (grouped by target) with every agent hearing ≥ m neighbours", () => {
    const m = 3;
    const t = make(800, m);
    let previous = -1;
    const inDegree = new Map<number, number>();
    for (const e of t.edges) {
      expect(e.target).toBeGreaterThanOrEqual(previous);
      previous = e.target;
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
    for (let i = 0; i < 800; i++) expect(inDegree.get(i) ?? 0).toBeGreaterThanOrEqual(m);
  });

  it("normalises the influences of each agent like the backend (deg + 1 draws)", () => {
    const t = make(300, 2);
    const sums = new Map<number, number>();
    for (const e of t.edges) {
      expect(e.influence).toBeGreaterThan(0);
      expect(e.influence).toBeLessThan(1);
      sums.set(e.target, (sums.get(e.target) ?? 0) + e.influence);
    }
    for (const sum of sums.values()) expect(sum).toBeLessThan(1.0000001);
  });

  it("grows hubs (preferential attachment)", () => {
    const t = make(5_000, 2);
    const degree = new Map<number, number>();
    for (const e of t.edges) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    const values = [...degree.values()];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(Math.max(...values)).toBeGreaterThan(8 * mean);
  });

  it("is deterministic per seed and differs between seeds", () => {
    expect(make(300, 2, 1)).toEqual(make(300, 2, 1));
    expect(make(300, 2, 1).edges).not.toEqual(make(300, 2, 2).edges);
  });

  it("assigns agent types in contiguous blocks and beliefs in [0, 1)", () => {
    const t = make(400, 2);
    expect(t.agents[0]?.silenceStrategy).toBe(0);
    expect(t.agents[399]?.silenceStrategy).toBe(3);
    expect(new Set(t.agents.map((a) => a.silenceStrategy)).size).toBe(4);
    for (const a of t.agents) {
      expect(a.initialBelief).toBeGreaterThanOrEqual(0);
      expect(a.initialBelief).toBeLessThanOrEqual(1);
      expect(a.name).toBeNull();
    }
    expect(new Set(t.edges.map((e) => e.bias))).toEqual(new Set([1, 2]));
  });

  it("rejects densities the backend cannot build", () => {
    expect(() => make(10, 10)).toThrow(/density/);
    expect(() => make(10, 0)).toThrow(/density/);
    expect(() => make(10.5, 2)).toThrow(/density/);
  });
});

describe("inferDensity", () => {
  it("recovers m from generated counts", () => {
    for (const [n, m] of [
      [10, 2],
      [1_000, 3],
      [100_000, 5],
      [150_000, 1],
    ] as const) {
      expect(inferDensity(n, expectedEdgeCount(n, m))).toBe(m);
    }
  });

  it("returns null for counts that no generated network has", () => {
    expect(inferDensity(10, 33)).toBeNull();
    expect(inferDensity(1, 0)).toBeNull();
    expect(inferDensity(5, 1_000)).toBeNull();
  });
});

describe("synthetic ids", () => {
  it("builds an int64-safe decimal run id and a lowercase UUID", () => {
    expect(syntheticRunId(5)).toBe("1260000000005");
    expect(syntheticNetworkId(255)).toBe("00000126-0000-4000-8000-0000000000ff");
  });
});
