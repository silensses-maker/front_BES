import { describe, expect, it } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import { topologyToData } from "./topology-to-data";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTopology(overrides: Partial<TopologyResponse> = {}): TopologyResponse {
  return {
    runId: "run-1",
    networkId: "net-1",
    agentCount: 0,
    edgeCount: 0,
    agentOffset: 0,
    agentLimit: 1000,
    edgeOffset: 0,
    edgeLimit: 5000,
    agents: [],
    edges: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("topologyToData", () => {
  describe("empty topology", () => {
    it("returns empty arrays when agents and edges are empty", () => {
      const result = topologyToData(makeTopology());
      expect(result.rawPoints).toEqual([]);
      expect(result.rawLinks).toEqual([]);
    });

    it("still returns a valid dataPrepConfig for empty data", () => {
      const { dataPrepConfig } = topologyToData(makeTopology());
      expect(dataPrepConfig.points.pointIdBy).toBe("id");
      expect(dataPrepConfig.points.pointColorBy).toBe("initialBelief");
      expect(dataPrepConfig.links?.linkSourceBy).toBe("source");
      expect(dataPrepConfig.links?.linkTargetsBy).toEqual(["target"]);
    });
  });

  describe("single agent, no edges", () => {
    it("maps agent fields correctly", () => {
      const topology = makeTopology({
        agentCount: 1,
        agents: [
          {
            index: 0,
            name: "Alice",
            initialBelief: 0.7,
            toleranceRadius: 0.2,
            toleranceOffset: 0,
            silenceStrategy: 1,
            silenceEffect: 0,
          },
        ],
        edges: [],
      });

      const { rawPoints, rawLinks } = topologyToData(topology);
      expect(rawPoints).toHaveLength(1);
      expect(rawLinks).toHaveLength(0);

      const point = rawPoints[0]!;
      expect(point.id).toBe("0");
      expect(point.initialBelief).toBe(0.7);
      expect(point.speaking).toBe(0);
      expect(point.silenceStrategy).toBe(1);
      expect(point.silenceEffect).toBe(0);
      expect(point.name).toBe("Alice");
    });
  });

  describe("id stringification", () => {
    it("converts numeric agent index to string id", () => {
      const topology = makeTopology({
        agentCount: 3,
        agents: [
          {
            index: 0,
            name: null,
            initialBelief: 0,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 42,
            name: null,
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 999,
            name: null,
            initialBelief: 1,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edges: [],
      });

      const { rawPoints } = topologyToData(topology);
      expect(rawPoints[0]!.id).toBe("0");
      expect(rawPoints[1]!.id).toBe("42");
      expect(rawPoints[2]!.id).toBe("999");
    });

    it("converts numeric edge source/target to string", () => {
      const topology = makeTopology({
        agentCount: 2,
        agents: [
          {
            index: 0,
            name: null,
            initialBelief: 0,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 1,
            name: null,
            initialBelief: 1,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edgeCount: 1,
        edges: [{ source: 0, target: 1, influence: 0.5, bias: 0 }],
      });

      const { rawLinks } = topologyToData(topology);
      expect(rawLinks[0]!.source).toBe("0");
      expect(rawLinks[0]!.target).toBe("1");
    });
  });

  describe("10 agents with random edges", () => {
    const agents = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      name: `Agent${i}`,
      initialBelief: i / 10,
      toleranceRadius: 0.25,
      toleranceOffset: 0,
      silenceStrategy: (i % 4) as 0 | 1 | 2 | 3,
      silenceEffect: (i % 3) as 0 | 1 | 2,
    }));

    const edges = [
      { source: 0, target: 1, influence: 0.5, bias: 0 as const },
      { source: 1, target: 2, influence: 0.3, bias: 1 as const },
      { source: 3, target: 7, influence: 0.8, bias: 2 as const },
    ];

    const topology = makeTopology({ agentCount: 10, edgeCount: 3, agents, edges });

    it("produces the correct number of points and links", () => {
      const { rawPoints, rawLinks } = topologyToData(topology);
      expect(rawPoints).toHaveLength(10);
      expect(rawLinks).toHaveLength(3);
    });

    it("preserves influence and bias on links", () => {
      const { rawLinks } = topologyToData(topology);
      expect(rawLinks[0]!.influence).toBe(0.5);
      expect(rawLinks[0]!.bias).toBe(0);
      expect(rawLinks[1]!.influence).toBe(0.3);
      expect(rawLinks[1]!.bias).toBe(1);
    });

    it("initialises speaking to 0 for every point", () => {
      const { rawPoints } = topologyToData(topology);
      for (const point of rawPoints) {
        expect(point.speaking).toBe(0);
      }
    });
  });

  describe("self-loop detection", () => {
    it("marks an agent with selfLoop=1 when it has a self-referencing edge", () => {
      const topology = makeTopology({
        agentCount: 2,
        agents: [
          {
            index: 0,
            name: null,
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 1,
            name: null,
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edgeCount: 2,
        edges: [
          { source: 0, target: 0, influence: 0.5, bias: 0 },
          { source: 0, target: 1, influence: 0.3, bias: 0 },
        ],
      });

      const { rawPoints } = topologyToData(topology);
      expect(rawPoints[0]!.selfLoop).toBe(1);
      expect(rawPoints[1]!.selfLoop).toBe(0);
    });

    it("marks all agents with selfLoop=0 when no self-loops exist", () => {
      const topology = makeTopology({
        agentCount: 2,
        agents: [
          {
            index: 0,
            name: null,
            initialBelief: 0.2,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 1,
            name: null,
            initialBelief: 0.8,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edgeCount: 1,
        edges: [{ source: 0, target: 1, influence: 0.5, bias: 0 }],
      });

      const { rawPoints } = topologyToData(topology);
      for (const point of rawPoints) {
        expect(point.selfLoop).toBe(0);
      }
    });

    it("includes selfLoop in pointIncludeColumns", () => {
      const { dataPrepConfig } = topologyToData(makeTopology());
      expect(dataPrepConfig.points.pointIncludeColumns).toContain("selfLoop");
    });
  });

  describe("missing optional fields", () => {
    it("omits name from rawPoints when all agents have null names", () => {
      // Cosmograph DataKit drops all-null columns and emits a warning, so we
      // omit the field entirely when no agent has a name.
      const topology = makeTopology({
        agentCount: 1,
        agents: [
          {
            index: 0,
            name: null,
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edges: [],
      });

      const { rawPoints, dataPrepConfig } = topologyToData(topology);
      expect(rawPoints[0]!).not.toHaveProperty("name");
      expect(dataPrepConfig.points.pointIncludeColumns).not.toContain("name");
    });

    it("preserves null name when at least one agent has a real name", () => {
      const topology = makeTopology({
        agentCount: 2,
        agents: [
          {
            index: 0,
            name: "Alice",
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
          {
            index: 1,
            name: null,
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
        edges: [],
      });

      const { rawPoints, dataPrepConfig } = topologyToData(topology);
      expect(rawPoints[0]!.name).toBe("Alice");
      expect(rawPoints[1]!.name).toBeNull();
      expect(dataPrepConfig.points.pointIncludeColumns).toContain("name");
    });
  });

  describe("dataPrepConfig correctness", () => {
    it("declares pointIncludeColumns with required downstream fields (no names)", () => {
      const { dataPrepConfig } = topologyToData(makeTopology());
      expect(dataPrepConfig.points.pointIncludeColumns).toEqual(
        expect.arrayContaining(["initialBelief", "silenceStrategy", "silenceEffect", "selfLoop"]),
      );
      // `name` only included when at least one agent has a non-null name
      expect(dataPrepConfig.points.pointIncludeColumns).not.toContain("name");
    });

    it("includes name in pointIncludeColumns when at least one agent is named", () => {
      const topology = makeTopology({
        agentCount: 1,
        agents: [
          {
            index: 0,
            name: "Alice",
            initialBelief: 0.5,
            toleranceRadius: 0,
            toleranceOffset: 0,
            silenceStrategy: 0,
            silenceEffect: 0,
          },
        ],
      });
      const { dataPrepConfig } = topologyToData(topology);
      expect(dataPrepConfig.points.pointIncludeColumns).toContain("name");
    });

    it("declares linkIncludeColumns with influence and bias", () => {
      const { dataPrepConfig } = topologyToData(makeTopology());
      expect(dataPrepConfig.links?.linkIncludeColumns).toEqual(
        expect.arrayContaining(["influence", "bias"]),
      );
    });
  });
});
