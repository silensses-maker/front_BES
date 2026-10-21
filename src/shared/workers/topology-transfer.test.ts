import { afterEach, describe, expect, it, vi } from "vitest";
import {
  columnsTransferList,
  HYDRATE_SLICE_MS,
  hydrateTopology,
  type TopologyColumns,
  TopologyLoadError,
  yieldToMain,
} from "./topology-transfer";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function columnsOf(agentCount: number, edgeCount: number): TopologyColumns {
  const agents = {
    initialBelief: Float64Array.from({ length: agentCount }, (_, i) => i / agentCount),
    toleranceRadius: new Float64Array(agentCount).fill(0.1),
    toleranceOffset: new Float64Array(agentCount),
    silenceStrategy: Uint8Array.from({ length: agentCount }, (_, i) => i % 4),
    silenceEffect: Uint8Array.from({ length: agentCount }, (_, i) => i % 3),
    names: null,
  };
  const edges = {
    source: Int32Array.from({ length: edgeCount }, (_, j) => (j + 1) % agentCount),
    target: Int32Array.from({ length: edgeCount }, (_, j) => j % agentCount),
    influence: Float64Array.from({ length: edgeCount }, (_, j) => (j % 10) / 10),
    bias: Uint8Array.from({ length: edgeCount }, (_, j) => (j % 2) + 1),
  };
  return {
    meta: {
      runId: "run-1",
      networkId: "net-1",
      agentCount,
      edgeCount,
      agentOffset: 0,
      agentLimit: 10_000,
      edgeOffset: 0,
      edgeLimit: 100_000,
    },
    agents,
    edges,
  };
}

const noYield = async () => {};

// ─── hydrateTopology ─────────────────────────────────────────────────────────

describe("hydrateTopology", () => {
  it("rebuilds the TopologyResponse objects: agents by index, edges in order, full limits", async () => {
    const topology = await hydrateTopology(columnsOf(3, 2), noYield);
    expect(topology).toEqual({
      runId: "run-1",
      networkId: "net-1",
      agentCount: 3,
      edgeCount: 2,
      agentOffset: 0,
      agentLimit: 3,
      edgeOffset: 0,
      edgeLimit: 2,
      agents: [
        {
          index: 0,
          name: null,
          initialBelief: 0,
          toleranceRadius: 0.1,
          toleranceOffset: 0,
          silenceStrategy: 0,
          silenceEffect: 0,
        },
        {
          index: 1,
          name: null,
          initialBelief: 1 / 3,
          toleranceRadius: 0.1,
          toleranceOffset: 0,
          silenceStrategy: 1,
          silenceEffect: 1,
        },
        {
          index: 2,
          name: null,
          initialBelief: 2 / 3,
          toleranceRadius: 0.1,
          toleranceOffset: 0,
          silenceStrategy: 2,
          silenceEffect: 2,
        },
      ],
      edges: [
        { source: 1, target: 0, influence: 0, bias: 1 },
        { source: 2, target: 1, influence: 0.1, bias: 2 },
      ],
    });
  });

  it("keeps the same key order as the parsed JSON objects", async () => {
    const { agents, edges } = await hydrateTopology(columnsOf(1, 1), noYield);
    expect(Object.keys(agents[0] ?? {})).toEqual([
      "index",
      "name",
      "initialBelief",
      "toleranceRadius",
      "toleranceOffset",
      "silenceStrategy",
      "silenceEffect",
    ]);
    expect(Object.keys(edges[0] ?? {})).toEqual(["source", "target", "influence", "bias"]);
  });

  it("turns NaN cells (JSON null) back into null and keeps names", async () => {
    const columns = columnsOf(2, 1);
    columns.agents.initialBelief[1] = Number.NaN;
    columns.edges.influence[0] = Number.NaN;
    columns.agents.names = ["Ana", null];
    const { agents, edges } = await hydrateTopology(columns, noYield);
    expect(agents[0]?.name).toBe("Ana");
    expect(agents[1]?.name).toBeNull();
    expect(agents[1]?.initialBelief).toBeNull();
    expect(edges[0]?.influence).toBeNull();
  });

  it("yields to the main thread between slices of a large topology", async () => {
    const yieldFn = vi.fn(async () => {});
    // A zero-ms slice yields after every clock read (every 4096 items)
    const topology = await hydrateTopology(columnsOf(10_000, 20_000), yieldFn, 0);
    expect(topology.agents).toHaveLength(10_000);
    expect(topology.edges).toHaveLength(20_000);
    expect(yieldFn).toHaveBeenCalledTimes(2 + 4);
  });

  it("does not yield for a small topology within one slice", async () => {
    const yieldFn = vi.fn(async () => {});
    await hydrateTopology(columnsOf(100, 200), yieldFn, HYDRATE_SLICE_MS);
    expect(yieldFn).not.toHaveBeenCalled();
  });
});

// ─── columnsTransferList ─────────────────────────────────────────────────────

describe("columnsTransferList", () => {
  it("lists the nine column buffers, each once", () => {
    const columns = columnsOf(4, 5);
    const list = columnsTransferList(columns);
    expect(list).toHaveLength(9);
    expect(new Set(list).size).toBe(9);
    expect(list).toContain(columns.edges.source.buffer);
    expect(list).toContain(columns.agents.silenceEffect.buffer);
  });
});

// ─── TopologyLoadError ───────────────────────────────────────────────────────

describe("TopologyLoadError", () => {
  it("carries the failure details and round-trips them as structured-clone-safe info", () => {
    const info = { kind: "http" as const, status: 503, attempts: 4, message: "answered 503" };
    const error = new TopologyLoadError(info);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TopologyLoadError");
    expect(error.message).toBe("answered 503");
    expect(error.toInfo()).toEqual(info);
  });
});

// ─── yieldToMain ─────────────────────────────────────────────────────────────

describe("yieldToMain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses scheduler.yield() when the browser has it", async () => {
    const schedulerYield = vi.fn(async () => {});
    vi.stubGlobal("scheduler", { yield: schedulerYield });
    await yieldToMain();
    expect(schedulerYield).toHaveBeenCalledOnce();
  });

  it("falls back to a MessageChannel macrotask", async () => {
    vi.stubGlobal("scheduler", undefined);
    let resolved = false;
    const pending = yieldToMain().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await pending;
    expect(resolved).toBe(true);
  });
});
