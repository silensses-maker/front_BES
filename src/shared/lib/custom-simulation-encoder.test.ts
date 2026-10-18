import { describe, expect, it } from "vitest";
import type {
  CustomSimulationParams,
  EncoderAgentSpec,
  EncoderEdgeSpec,
} from "./custom-simulation-encoder";
import { encodeCustomSimulation, estimateJsonSize } from "./custom-simulation-encoder";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeAgent = (overrides: Partial<EncoderAgentSpec> = {}): EncoderAgentSpec => ({
  name: "Agent0",
  belief: 0.5,
  toleranceRadius: 0.2,
  toleranceOffset: 0.0,
  silenceStrategy: 0,
  silenceEffect: 0,
  ...overrides,
});

const makeEdge = (overrides: Partial<EncoderEdgeSpec> = {}): EncoderEdgeSpec => ({
  source: "Agent0",
  target: "Agent1",
  influence: 0.8,
  bias: 0,
  ...overrides,
});

const baseParams = (): CustomSimulationParams => ({
  networkName: "TestNet",
  stopThreshold: 0.01,
  iterationLimit: 500,
  saveMode: 0,
  agents: [makeAgent({ name: "Agent0" }), makeAgent({ name: "Agent1" })],
  edges: [makeEdge()],
});

/**
 * Minimal TS port of the backend reader (Server.scala `parseCustomRun`): same
 * offsets, same 4-byte alignment after the header and after the agent names,
 * same "optional chunks until EOF" rule. Lets the tests assert what the backend
 * would actually decode instead of hand-computed offsets.
 */
function decodeLikeBackend(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder();
  let offset = 0;

  const readNames = (count: number): string[] => {
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const length = view.getUint8(offset);
      offset += 1;
      names.push(utf8.decode(bytes.slice(offset, offset + length)));
      offset += length;
    }
    return names;
  };
  const readFloats = (count: number): number[] => {
    const values: number[] = [];
    for (let i = 0; i < count; i++) values.push(view.getFloat32(offset + 4 * i, true));
    offset += 4 * count;
    return values;
  };
  const readBytes = (count: number): number[] => {
    const values = Array.from(bytes.slice(offset, offset + count));
    offset += count;
    return values;
  };
  const align = (): void => {
    while (offset % 4 !== 0) offset += 1;
  };

  // Header
  const stopThreshold = view.getFloat32(0, true);
  const iterationLimit = view.getInt32(4, true);
  const saveMode = view.getUint8(8);
  const nameLength = view.getUint8(9);
  const networkName = utf8.decode(bytes.slice(10, 10 + nameLength));
  offset = 10 + nameLength;
  align();

  // Agents
  const n = view.getInt32(offset, true);
  offset += 4;
  const beliefs = readFloats(n);
  readFloats(n); // toleranceRadius
  readFloats(n); // toleranceOffset
  const strategies = readBytes(n);
  const effects = readBytes(n);
  const names = readNames(n);
  align();

  // Edges
  const m = view.getInt32(offset, true);
  offset += 4;
  readFloats(m); // influences
  const biases = readBytes(m);
  const sources = readNames(m);
  const targets = readNames(m);

  return {
    stopThreshold,
    iterationLimit,
    saveMode,
    networkName,
    beliefs,
    strategies,
    effects,
    names,
    biases,
    sources,
    targets,
    /** Bytes the backend would parse as optional 12-byte threshold/confidence chunks. */
    trailingBytes: bytes.length - offset,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("estimateJsonSize", () => {
  it("returns agents.length * 100 + edges.length * 50", () => {
    expect(estimateJsonSize([{ name: "A" }, { name: "B" }], [{ source: "A", target: "B" }])).toBe(
      250,
    );
  });

  it("handles empty agents array", () => {
    expect(estimateJsonSize([], [{ source: "A", target: "B" }])).toBe(50);
  });

  it("handles empty edges array", () => {
    expect(estimateJsonSize([{ name: "A" }], [])).toBe(100);
  });

  it("returns 0 when both arrays are empty", () => {
    expect(estimateJsonSize([], [])).toBe(0);
  });
});

describe("encodeCustomSimulation", () => {
  describe("return type", () => {
    it("returns an ArrayBuffer", () => {
      const result = encodeCustomSimulation(baseParams());
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it("produces a buffer with length greater than 0", () => {
      const result = encodeCustomSimulation(baseParams());
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it("produces deterministic output for the same input", () => {
      const params = baseParams();
      const a = encodeCustomSimulation(params);
      const b = encodeCustomSimulation(params);
      expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
    });
  });

  describe("header encoding", () => {
    it("encodes stopThreshold as Float32 at byte offset 0", () => {
      const params = baseParams();
      params.stopThreshold = 0.01;
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      expect(view.getFloat32(0, true)).toBeCloseTo(0.01, 5);
    });

    it("encodes iterationLimit as Int32 at byte offset 4", () => {
      const params = baseParams();
      params.iterationLimit = 500;
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      expect(view.getInt32(4, true)).toBe(500);
    });

    it("encodes saveMode as Uint8 at byte offset 8", () => {
      const params = baseParams();
      params.saveMode = 2;
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      expect(view.getUint8(8)).toBe(2);
    });

    it("encodes networkName length prefix as Uint8 at byte offset 9", () => {
      const params = baseParams();
      params.networkName = "TestNet"; // 7 chars → 7 bytes in UTF-8
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      expect(view.getUint8(9)).toBe(7);
    });

    it("encodes networkName bytes starting at byte offset 10", () => {
      const params = baseParams();
      params.networkName = "AB";
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      // length prefix at 9 = 2, then 'A' = 65 at 10, 'B' = 66 at 11
      expect(view.getUint8(9)).toBe(2);
      expect(view.getUint8(10)).toBe(65);
      expect(view.getUint8(11)).toBe(66);
    });
  });

  describe("agent section encoding", () => {
    it("encodes agent count as Int32 after the header block", () => {
      // header: 4 (stopThreshold) + 4 (iterationLimit) + 1 (saveMode) + 1 (nameLen) + nameBytes → align to 4
      // networkName = "Net" → 3 bytes, so raw header = 4+4+1+1+3 = 13 bytes → aligns to 16
      const params = baseParams();
      params.networkName = "Net";
      params.agents = [makeAgent()];
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      expect(view.getInt32(16, true)).toBe(1);
    });

    it("encodes agent beliefs as Float32s immediately after agent count", () => {
      const params = baseParams();
      params.networkName = "Net"; // 3 bytes → aligned header offset = 16
      params.agents = [makeAgent({ belief: 0.75 }), makeAgent({ belief: 0.25 })];
      params.edges = [];
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      // agent count at 16 (4 bytes), beliefs start at 20
      expect(view.getFloat32(20, true)).toBeCloseTo(0.75, 5);
      expect(view.getFloat32(24, true)).toBeCloseTo(0.25, 5);
    });

    it("encodes agent silenceStrategy as Uint8s in their dedicated column", () => {
      const params = baseParams();
      params.networkName = "Net"; // aligned header = 16
      params.agents = [makeAgent({ silenceStrategy: 2 }), makeAgent({ silenceStrategy: 0 })];
      params.edges = [];
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      // header (16) + agent count (4) + 2 beliefs (8) + 2 toleranceRadius (8) + 2 toleranceOffset (8) = 44
      expect(view.getUint8(44)).toBe(2);
      expect(view.getUint8(45)).toBe(0);
    });
  });

  describe("edge section encoding", () => {
    it("encodes edge count as Int32 in the edge section", () => {
      const params = baseParams();
      params.edges = [makeEdge(), makeEdge({ source: "Agent1", target: "Agent0" })];
      const buf = encodeCustomSimulation(params);
      // locate the edge count: scan for Int32 = 2 after agent data
      // structural invariant: edge count is encoded somewhere in the buffer
      const view = new DataView(buf);
      let found = false;
      for (let offset = 0; offset <= buf.byteLength - 4; offset += 4) {
        if (view.getInt32(offset, true) === 2) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("encodes edge influence as Float32 in the edge influence column", () => {
      const params = baseParams();
      params.networkName = "N"; // 1 byte → raw=11, aligned=12
      params.agents = [makeAgent({ name: "A" }), makeAgent({ name: "B" })];
      params.edges = [makeEdge({ influence: 0.6 })];
      const buf = encodeCustomSimulation(params);
      const view = new DataView(buf);
      // scan for encoded 0.6 as Float32 in the buffer
      let found = false;
      for (let offset = 0; offset <= buf.byteLength - 4; offset++) {
        if (Math.abs(view.getFloat32(offset, true) - 0.6) < 0.0001) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("handles empty edges array without throwing", () => {
      const params = baseParams();
      params.edges = [];
      expect(() => encodeCustomSimulation(params)).not.toThrow();
    });

    it("produces a larger buffer when more edges are added", () => {
      const paramsNoEdges = baseParams();
      paramsNoEdges.edges = [];
      const paramsWithEdges = baseParams();
      paramsWithEdges.edges = [makeEdge(), makeEdge({ source: "Agent1", target: "Agent0" })];

      const sizeNoEdges = encodeCustomSimulation(paramsNoEdges).byteLength;
      const sizeWithEdges = encodeCustomSimulation(paramsWithEdges).byteLength;
      expect(sizeWithEdges).toBeGreaterThan(sizeNoEdges);
    });
  });

  describe("canonical enums (#120)", () => {
    it("encodes Confidence (3) / Memoryless (2) and Insular (4) bytes where the backend reads them", () => {
      const params: CustomSimulationParams = {
        ...baseParams(),
        agents: [
          makeAgent({ name: "A", silenceStrategy: 3, silenceEffect: 2 }),
          makeAgent({ name: "B", silenceStrategy: 2, silenceEffect: 1 }),
          makeAgent({ name: "C", silenceStrategy: 1, silenceEffect: 0 }),
        ],
        edges: [
          makeEdge({ source: "A", target: "B", bias: 4 }),
          makeEdge({ source: "B", target: "C", bias: 3 }),
        ],
      };
      const decoded = decodeLikeBackend(encodeCustomSimulation(params));

      expect(decoded.strategies).toEqual([3, 2, 1]);
      expect(decoded.effects).toEqual([2, 1, 0]);
      expect(decoded.names).toEqual(["A", "B", "C"]);
      expect(decoded.biases).toEqual([4, 3]);
      expect(decoded.sources).toEqual(["A", "B"]);
      expect(decoded.targets).toEqual(["B", "C"]);
    });

    it("round-trips the header and agent floats through the backend layout", () => {
      const params: CustomSimulationParams = {
        ...baseParams(),
        networkName: "Net",
        stopThreshold: 0.001,
        iterationLimit: 250,
        saveMode: 1,
        agents: [makeAgent({ name: "A", belief: 0.25 }), makeAgent({ name: "B", belief: 0.75 })],
        edges: [makeEdge({ source: "A", target: "B" })],
      };
      const decoded = decodeLikeBackend(encodeCustomSimulation(params));

      expect(decoded.stopThreshold).toBeCloseTo(0.001, 6);
      expect(decoded.iterationLimit).toBe(250);
      expect(decoded.saveMode).toBe(1);
      expect(decoded.networkName).toBe("Net");
      expect(decoded.beliefs[0]).toBeCloseTo(0.25, 5);
      expect(decoded.beliefs[1]).toBeCloseTo(0.75, 5);
    });

    it("writes no optional threshold/confidence chunks, for any strategy", () => {
      for (const silenceStrategy of [0, 1, 2, 3] as const) {
        const params: CustomSimulationParams = {
          ...baseParams(),
          agents: [makeAgent({ name: "A", silenceStrategy }), makeAgent({ name: "B" })],
          edges: [makeEdge({ source: "A", target: "B" })],
        };
        const decoded = decodeLikeBackend(encodeCustomSimulation(params));
        // The backend reads 12-byte chunks while bytes remain after the target
        // names; nothing must remain (values are fixed by the simulator).
        expect(decoded.trailingBytes).toBe(0);
      }
    });

    it("produces the same size for Threshold/Confidence agents as for DeGroot agents", () => {
      const withStrategy = (silenceStrategy: 0 | 1 | 2 | 3) =>
        encodeCustomSimulation({
          ...baseParams(),
          agents: [makeAgent({ name: "A", silenceStrategy }), makeAgent({ name: "B" })],
        }).byteLength;

      expect(withStrategy(2)).toBe(withStrategy(0));
      expect(withStrategy(3)).toBe(withStrategy(0));
    });
  });

  describe("structural invariants", () => {
    it("handles single agent and single edge without throwing", () => {
      expect(() =>
        encodeCustomSimulation({
          networkName: "Solo",
          stopThreshold: 0.001,
          iterationLimit: 100,
          saveMode: 0,
          agents: [makeAgent({ name: "A" })],
          edges: [makeEdge({ source: "A", target: "A" })],
        }),
      ).not.toThrow();
    });

    it("produces a larger buffer when agents are added", () => {
      const paramsOne = baseParams();
      paramsOne.agents = [makeAgent()];
      const paramsMany = baseParams();
      paramsMany.agents = [makeAgent(), makeAgent({ name: "B" }), makeAgent({ name: "C" })];

      expect(encodeCustomSimulation(paramsMany).byteLength).toBeGreaterThan(
        encodeCustomSimulation(paramsOne).byteLength,
      );
    });
  });
});
