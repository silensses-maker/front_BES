import { describe, expect, it } from "vitest";
import type { CustomSimSchemaInput, GeneratedSimSchemaInput } from "./validation";
import { computeMaxEdges, customSimSchema, generatedSimSchema } from "./validation";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseAgentType: GeneratedSimSchemaInput["agentTypes"][number] = {
  id: "agent-type-1",
  count: 5,
  silenceStrategy: 0,
  silenceEffect: 0,
};

const baseBiasType: GeneratedSimSchemaInput["biasTypes"][number] = {
  id: "bias-type-1",
  count: 0, // will be overridden per test
  cognitiveBias: 0,
};

function makeGeneratedInput(
  overrides: Partial<GeneratedSimSchemaInput> = {},
): GeneratedSimSchemaInput {
  const numberOfAgents = overrides.numberOfAgents ?? 5;
  const density = overrides.density ?? 2;
  const maxEdges = computeMaxEdges(density, numberOfAgents);

  return {
    networkType: "generated",
    numberOfAgents,
    numberOfNetworks: 1,
    density,
    iterationLimit: 100,
    stopThreshold: 0.01,
    seed: null,
    saveMode: 0,
    agentTypes: [{ ...baseAgentType, count: numberOfAgents }],
    biasTypes: [{ ...baseBiasType, count: maxEdges }],
    ...overrides,
  };
}

const baseCustomAgent: CustomSimSchemaInput["agents"][number] = {
  name: "Alice",
  belief: 0.5,
  toleranceRadius: 0.3,
  toleranceOffset: 0.0,
  silenceStrategy: 0,
  silenceEffect: 0,
};

const baseCustomEdge: CustomSimSchemaInput["edges"][number] = {
  source: "Alice",
  target: "Bob",
  influence: 0.8,
  bias: 0,
};

function makeCustomInput(overrides: Partial<CustomSimSchemaInput> = {}): CustomSimSchemaInput {
  return {
    networkType: "custom",
    networkName: "Test Network",
    iterationLimit: 100,
    stopThreshold: 0.01,
    saveMode: 0,
    agents: [
      { ...baseCustomAgent, name: "Alice" },
      { ...baseCustomAgent, name: "Bob" },
    ],
    edges: [{ ...baseCustomEdge, source: "Alice", target: "Bob" }],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("computeMaxEdges", () => {
  it("returns 0 when numberOfAgents is less than density", () => {
    expect(computeMaxEdges(5, 3)).toBe(0);
  });

  it("returns 0 when numberOfAgents is 0", () => {
    expect(computeMaxEdges(3, 0)).toBe(0);
  });

  it("computes correct formula when numberOfAgents equals density", () => {
    // When numberOfAgents === density, the second term is 0
    // result = density * (density - 1) + 0
    expect(computeMaxEdges(3, 3)).toBe(3 * 2);
    expect(computeMaxEdges(5, 5)).toBe(5 * 4);
  });

  it("computes correct formula for standard inputs", () => {
    // density=2, numberOfAgents=5: 2*1 + (5-2)*2*2 = 2 + 12 = 14
    expect(computeMaxEdges(2, 5)).toBe(14);
    // density=3, numberOfAgents=6: 3*2 + (6-3)*2*3 = 6 + 18 = 24
    expect(computeMaxEdges(3, 6)).toBe(24);
  });

  it("handles large values without overflow", () => {
    const result = computeMaxEdges(100, 1000);
    // 100*99 + (1000-100)*2*100 = 9900 + 180000 = 189900
    expect(result).toBe(189900);
  });
});

describe("generatedSimSchema", () => {
  describe("valid inputs", () => {
    it("accepts a valid GeneratedSimFormValues with null seed", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ seed: null }));
      expect(result.success).toBe(true);
    });

    it("accepts a valid GeneratedSimFormValues with numeric seed", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ seed: 42 }));
      expect(result.success).toBe(true);
    });

    it("accepts multiple agent types that sum to numberOfAgents", () => {
      const density = 2;
      const numberOfAgents = 6;
      const maxEdges = computeMaxEdges(density, numberOfAgents);
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents,
          density,
          agentTypes: [
            { ...baseAgentType, count: 4 },
            { id: "agent-type-2", count: 2, silenceStrategy: 1, silenceEffect: 1 },
          ],
          biasTypes: [{ ...baseBiasType, count: maxEdges }],
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("field validation", () => {
    it("rejects numberOfAgents less than 1", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ numberOfAgents: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects numberOfNetworks less than 1", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ numberOfNetworks: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects density less than 2", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ density: 1 }));
      expect(result.success).toBe(false);
    });

    it("rejects iterationLimit less than 1", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ iterationLimit: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects stopThreshold of 0 (must be > 0)", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ stopThreshold: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects stopThreshold of 1 (must be < 1)", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ stopThreshold: 1 }));
      expect(result.success).toBe(false);
    });

    it("rejects stopThreshold greater than 1", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ stopThreshold: 1.5 }));
      expect(result.success).toBe(false);
    });

    it("rejects empty agentTypes array", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ agentTypes: [] }));
      expect(result.success).toBe(false);
    });

    it("rejects empty biasTypes array", () => {
      const result = generatedSimSchema.safeParse(makeGeneratedInput({ biasTypes: [] }));
      expect(result.success).toBe(false);
    });

    it("rejects agentTypes with invalid silenceStrategy value", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          agentTypes: [{ ...baseAgentType, silenceStrategy: 4 as 0 }],
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("custom refinements", () => {
    it("rejects when totalAgents does not equal numberOfAgents", () => {
      const numberOfAgents = 5;
      const density = 2;
      const maxEdges = computeMaxEdges(density, numberOfAgents);
      // agentTypes sum = 3, but numberOfAgents = 5
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents,
          density,
          agentTypes: [{ ...baseAgentType, count: 3 }],
          biasTypes: [{ ...baseBiasType, count: maxEdges }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasAgentMismatch = result.error.issues.some(
          (issue) => issue.message === "agentCountMismatch",
        );
        expect(hasAgentMismatch).toBe(true);
      }
    });

    it("reports agentCountMismatch on the numberOfAgents path", () => {
      const numberOfAgents = 5;
      const density = 2;
      const maxEdges = computeMaxEdges(density, numberOfAgents);
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents,
          density,
          agentTypes: [{ ...baseAgentType, count: 3 }],
          biasTypes: [{ ...baseBiasType, count: maxEdges }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const mismatchIssue = result.error.issues.find(
          (issue) => issue.message === "agentCountMismatch",
        );
        expect(mismatchIssue?.path).toEqual(["numberOfAgents"]);
      }
    });

    it("rejects when totalBias does not equal maxEdges", () => {
      const numberOfAgents = 5;
      const density = 2;
      // biasTypes sum is wrong (1 instead of maxEdges)
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents,
          density,
          agentTypes: [{ ...baseAgentType, count: numberOfAgents }],
          biasTypes: [{ ...baseBiasType, count: 1 }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasBiasMismatch = result.error.issues.some(
          (issue) => issue.message === "biasCountMismatch",
        );
        expect(hasBiasMismatch).toBe(true);
      }
    });

    it("reports biasCountMismatch on the biasTypes path", () => {
      const numberOfAgents = 5;
      const density = 2;
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents,
          density,
          agentTypes: [{ ...baseAgentType, count: numberOfAgents }],
          biasTypes: [{ ...baseBiasType, count: 1 }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const mismatchIssue = result.error.issues.find(
          (issue) => issue.message === "biasCountMismatch",
        );
        expect(mismatchIssue?.path).toEqual(["biasTypes"]);
      }
    });

    it("can report both refinement errors simultaneously", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          numberOfAgents: 5,
          density: 2,
          agentTypes: [{ ...baseAgentType, count: 3 }], // wrong sum
          biasTypes: [{ ...baseBiasType, count: 1 }], // wrong bias count
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("agentCountMismatch");
        expect(messages).toContain("biasCountMismatch");
      }
    });
  });
});

describe("customSimSchema", () => {
  describe("valid inputs", () => {
    it("accepts valid CustomSimFormValues", () => {
      const result = customSimSchema.safeParse(makeCustomInput());
      expect(result.success).toBe(true);
    });

    it("accepts multiple agents and edges when all references are valid", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
            { ...baseCustomAgent, name: "Carol" },
          ],
          edges: [
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
            { ...baseCustomEdge, source: "Bob", target: "Carol" },
            { ...baseCustomEdge, source: "Carol", target: "Alice" },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("field validation", () => {
    it("rejects networkName shorter than 1 character", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ networkName: "" }));
      expect(result.success).toBe(false);
    });

    it("rejects iterationLimit less than 1", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ iterationLimit: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects stopThreshold of 0 (must be > 0)", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ stopThreshold: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects stopThreshold of 1 (must be < 1)", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ stopThreshold: 1 }));
      expect(result.success).toBe(false);
    });

    it("rejects empty agents array", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ agents: [] }));
      expect(result.success).toBe(false);
    });

    it("rejects empty edges array", () => {
      const result = customSimSchema.safeParse(makeCustomInput({ edges: [] }));
      expect(result.success).toBe(false);
    });
  });

  describe("customAgentSchema field validation", () => {
    it("rejects agent with belief below 0", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", belief: -0.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects agent with belief above 1", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", belief: 1.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects agent with toleranceRadius below 0", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", toleranceRadius: -0.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects agent with toleranceRadius above 1", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", toleranceRadius: 1.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects agent with toleranceOffset below -1", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", toleranceOffset: -1.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects agent with toleranceOffset above 1", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [{ ...baseCustomAgent, name: "Alice", toleranceOffset: 1.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts agent with toleranceOffset at boundary values -1 and 1", () => {
      const resultNeg = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice", toleranceOffset: -1 },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Alice", target: "Bob" }],
        }),
      );
      expect(resultNeg.success).toBe(true);

      const resultPos = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice", toleranceOffset: 1 },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Alice", target: "Bob" }],
        }),
      );
      expect(resultPos.success).toBe(true);
    });
  });

  describe("customEdgeSchema field validation", () => {
    it("rejects edge with influence below 0", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          edges: [{ ...baseCustomEdge, influence: -0.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects edge with influence above 1", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          edges: [{ ...baseCustomEdge, influence: 1.1 }],
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("custom refinements", () => {
    it("rejects edge whose source agent does not exist in agents array", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Unknown", target: "Bob" }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasUnknownAgent = result.error.issues.some(
          (issue) => issue.message === "edgeUnknownAgent",
        );
        expect(hasUnknownAgent).toBe(true);
      }
    });

    it("rejects edge whose target agent does not exist in agents array", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Alice", target: "Unknown" }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasUnknownAgent = result.error.issues.some(
          (issue) => issue.message === "edgeUnknownAgent",
        );
        expect(hasUnknownAgent).toBe(true);
      }
    });

    it("reports edgeUnknownAgent on the correct path (edges[i].source)", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Ghost", target: "Bob" }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message === "edgeUnknownAgent");
        expect(issue?.path).toEqual(["edges", 0, "source"]);
      }
    });

    it("reports edgeUnknownAgent on the correct path (edges[i].target)", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [{ ...baseCustomEdge, source: "Alice", target: "Ghost" }],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message === "edgeUnknownAgent");
        expect(issue?.path).toEqual(["edges", 0, "target"]);
      }
    });

    it("rejects duplicate directed edge (same source and target)", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
          ],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasDuplicate = result.error.issues.some((issue) => issue.message === "duplicateEdge");
        expect(hasDuplicate).toBe(true);
      }
    });

    it("reports duplicateEdge on the correct path (edges[i])", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
          ],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message === "duplicateEdge");
        // The second edge (index 1) is the duplicate
        expect(issue?.path).toEqual(["edges", 1]);
      }
    });

    it("accepts reverse edges as non-duplicate (Alice→Bob and Bob→Alice are distinct)", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [
            { ...baseCustomEdge, source: "Alice", target: "Bob" },
            { ...baseCustomEdge, source: "Bob", target: "Alice" },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });

    it("reports both unknown agent and duplicate errors when applicable", () => {
      const result = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice" },
            { ...baseCustomAgent, name: "Bob" },
          ],
          edges: [
            { ...baseCustomEdge, source: "Ghost", target: "Bob" },
            { ...baseCustomEdge, source: "Ghost", target: "Bob" },
          ],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("edgeUnknownAgent");
        expect(messages).toContain("duplicateEdge");
      }
    });
  });
});
