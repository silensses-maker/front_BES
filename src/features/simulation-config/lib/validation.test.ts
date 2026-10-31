import { describe, expect, it } from "vitest";
import type { CustomSimFormValues, GeneratedSimFormValues } from "../types/simulation-config.types";
import type { CustomSimSchemaInput, GeneratedSimSchemaInput } from "./validation";
import {
  computeMaxEdges,
  customSimSchema,
  findDuplicateAgentNames,
  generatedSimSchema,
  MAX_CUSTOM_NAME_LENGTH,
  MAX_SEED,
  validateCustomForm,
  validateGeneratedForm,
} from "./validation";

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

    it("accepts every canonical silenceStrategy (0-3) and silenceEffect (0-2)", () => {
      for (const silenceStrategy of [0, 1, 2, 3] as const) {
        for (const silenceEffect of [0, 1, 2] as const) {
          const result = generatedSimSchema.safeParse(
            makeGeneratedInput({
              agentTypes: [{ ...baseAgentType, count: 5, silenceStrategy, silenceEffect }],
            }),
          );
          expect(result.success).toBe(true);
        }
      }
    });

    it("accepts every canonical cognitiveBias (0-4)", () => {
      const maxEdges = computeMaxEdges(2, 5);
      for (const cognitiveBias of [0, 1, 2, 3, 4] as const) {
        const result = generatedSimSchema.safeParse(
          makeGeneratedInput({ biasTypes: [{ ...baseBiasType, count: maxEdges, cognitiveBias }] }),
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe("legacy threshold/confidence fields (#120)", () => {
    const legacyRow = (extra: Record<string, unknown>) =>
      ({
        ...baseAgentType,
        count: 5,
        silenceStrategy: 2,
        ...extra,
      }) as GeneratedSimSchemaInput["agentTypes"][number];

    it("accepts rows that still carry majorityThreshold / confidence and drops them", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          agentTypes: [legacyRow({ majorityThreshold: 0.4, confidence: 0.9 })],
        }),
      );
      expect(result.success).toBe(true);
      const row = result.data?.agentTypes[0];
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("majorityThreshold");
      expect(row).not.toHaveProperty("confidence");
      expect(row).toEqual({ id: "agent-type-1", count: 5, silenceStrategy: 2, silenceEffect: 0 });
    });

    it("never errors on legacy values, even outside the old 0-1 range or of the wrong type", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({
          agentTypes: [legacyRow({ majorityThreshold: 5, confidence: "high" })],
        }),
      );
      expect(result.success).toBe(true);
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

    it("rejects a density equal to numberOfAgents with densityExceedsAgents on the density path (#122)", () => {
      // computeMaxEdges(5, 5) = 20 — the bias rows match, only the density rule fails.
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({ numberOfAgents: 5, density: 5 }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message === "densityExceedsAgents");
        expect(issue?.path).toEqual(["density"]);
      }
    });

    it("rejects a density greater than numberOfAgents (#122)", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({ numberOfAgents: 3, density: 4 }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain("densityExceedsAgents");
      }
    });

    it("accepts the largest valid density (numberOfAgents - 1)", () => {
      const result = generatedSimSchema.safeParse(
        makeGeneratedInput({ numberOfAgents: 5, density: 4 }),
      );
      expect(result.success).toBe(true);
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

  describe("canonical enums on custom agents and edges (#120)", () => {
    it("accepts every silenceStrategy (0-3) and silenceEffect (0-2) on an agent", () => {
      for (const silenceStrategy of [0, 1, 2, 3] as const) {
        for (const silenceEffect of [0, 1, 2] as const) {
          const result = customSimSchema.safeParse(
            makeCustomInput({
              agents: [
                { ...baseCustomAgent, name: "Alice", silenceStrategy, silenceEffect },
                { ...baseCustomAgent, name: "Bob" },
              ],
            }),
          );
          expect(result.success).toBe(true);
        }
      }
    });

    it("accepts every cognitive bias (0-4) on an edge", () => {
      for (const bias of [0, 1, 2, 3, 4] as const) {
        const result = customSimSchema.safeParse(
          makeCustomInput({ edges: [{ ...baseCustomEdge, bias }] }),
        );
        expect(result.success).toBe(true);
      }
    });

    it("rejects values outside the canonical enums", () => {
      const badStrategy = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice", silenceStrategy: 4 as 0 },
            { ...baseCustomAgent, name: "Bob" },
          ],
        }),
      );
      const badEffect = customSimSchema.safeParse(
        makeCustomInput({
          agents: [
            { ...baseCustomAgent, name: "Alice", silenceEffect: 3 as 0 },
            { ...baseCustomAgent, name: "Bob" },
          ],
        }),
      );
      const badBias = customSimSchema.safeParse(
        makeCustomInput({ edges: [{ ...baseCustomEdge, bias: 5 as 0 }] }),
      );
      expect(badStrategy.success).toBe(false);
      expect(badEffect.success).toBe(false);
      expect(badBias.success).toBe(false);
    });

    it("accepts and drops legacy threshold/confidence keys on custom agents", () => {
      const legacyAgent = {
        ...baseCustomAgent,
        name: "Alice",
        silenceStrategy: 3,
        majorityThreshold: 0.6,
        confidence: 0.9,
      } as CustomSimSchemaInput["agents"][number];
      const result = customSimSchema.safeParse(
        makeCustomInput({ agents: [legacyAgent, { ...baseCustomAgent, name: "Bob" }] }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.agents[0]).not.toHaveProperty("majorityThreshold");
      expect(result.data?.agents[0]).not.toHaveProperty("confidence");
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

// ─── Role quotas in the form validators (#122) ───────────────────────────────

function makeGeneratedValues(
  overrides: Partial<GeneratedSimFormValues> = {},
): GeneratedSimFormValues {
  return {
    ...(makeGeneratedInput() as GeneratedSimFormValues),
    ...overrides,
  };
}

function makeCustomValues(agentCount: number, iterationLimit = 100): CustomSimFormValues {
  const agents = Array.from({ length: agentCount }, (_, i) => ({
    ...baseCustomAgent,
    name: `A${i}`,
  }));
  return {
    ...(makeCustomInput() as CustomSimFormValues),
    iterationLimit,
    agents,
    edges: [{ ...baseCustomEdge, source: "A0", target: "A1" }],
  };
}

describe("validateGeneratedForm", () => {
  it("flags networkLimitExceeded when numberOfNetworks is above maxNetworks", () => {
    const errors = validateGeneratedForm(makeGeneratedValues({ numberOfNetworks: 6 }), 100, 100, 5);
    expect(errors.networkLimitExceeded).toBe(true);
  });

  it("accepts numberOfNetworks equal to maxNetworks", () => {
    const errors = validateGeneratedForm(makeGeneratedValues({ numberOfNetworks: 5 }), 100, 100, 5);
    expect(errors).toEqual({});
  });

  it("does not check the network quota when maxNetworks is not provided", () => {
    const errors = validateGeneratedForm(makeGeneratedValues({ numberOfNetworks: 500 }), 100, 100);
    expect(errors.networkLimitExceeded).toBeUndefined();
  });

  it("treats an Infinity maxNetworks (Administrator) as unlimited", () => {
    const errors = validateGeneratedForm(
      makeGeneratedValues({ numberOfNetworks: 10_000 }),
      Infinity,
      Infinity,
      Infinity,
    );
    expect(errors).toEqual({});
  });

  it("accepts whole seeds from 0 to 2^53 − 1 and flags any other seed as seedInvalid (#127)", () => {
    expect(MAX_SEED).toBe(9_007_199_254_740_991);
    for (const seed of [null, 0, 1, 42, MAX_SEED]) {
      const values = makeGeneratedInput({ seed }) as GeneratedSimFormValues;
      expect(validateGeneratedForm(values, undefined, undefined), String(seed)).toEqual({});
    }
    for (const seed of [
      -1,
      -42,
      1.5,
      MAX_SEED + 1,
      2 ** 60,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const values = makeGeneratedInput({ seed }) as GeneratedSimFormValues;
      const errors = validateGeneratedForm(values, undefined, undefined);
      expect(errors.seedInvalid, String(seed)).toBe(true);
      expect(errors.countsInvalid, String(seed)).toBeUndefined();
    }
  });

  it("maps the density rule to densityExceedsAgents instead of countsInvalid", () => {
    const values = makeGeneratedInput({ numberOfAgents: 5, density: 5 }) as GeneratedSimFormValues;
    const errors = validateGeneratedForm(values, undefined, undefined);
    expect(errors.densityExceedsAgents).toBe(true);
    expect(errors.countsInvalid).toBeUndefined();
  });

  describe('scope "network" (the Network step\'s Next)', () => {
    /** Rows that do not match the totals and one row with an invalid count: the Agents step's. */
    const brokenRows = {
      agentTypes: [{ ...baseAgentType, count: 3 }],
      biasTypes: [{ ...baseBiasType, count: 0 }],
    };

    it("ignores the agent and bias rows, their sums included", () => {
      const values = makeGeneratedInput({
        numberOfAgents: 10,
        ...brokenRows,
      }) as GeneratedSimFormValues;
      expect(validateGeneratedForm(values, undefined, undefined)).toMatchObject({
        agentCountMismatch: true,
        biasCountMismatch: true,
        countsInvalid: true,
      });
      expect(validateGeneratedForm(values, undefined, undefined, undefined, "network")).toEqual({});
    });

    it("still reports this step's own fields and quotas", () => {
      const values = makeGeneratedInput({
        numberOfAgents: 0,
        numberOfNetworks: 9,
        iterationLimit: 500,
        stopThreshold: 1,
        seed: -1,
        ...brokenRows,
      }) as GeneratedSimFormValues;
      const errors = validateGeneratedForm(values, 100, 100, 5, "network");
      // numberOfAgents 0 also trips the density rule (2 >= 0)
      expect(errors).toEqual({
        countsInvalid: true,
        densityExceedsAgents: true,
        stopThresholdOutOfRange: true,
        seedInvalid: true,
        iterationLimitExceeded: true,
        networkLimitExceeded: true,
      });
      const density = makeGeneratedInput({
        numberOfAgents: 5,
        density: 5,
      }) as GeneratedSimFormValues;
      expect(validateGeneratedForm(density, undefined, undefined, undefined, "network")).toEqual({
        densityExceedsAgents: true,
      });
    });

    it("checks the agent quota against the step's total, not the rows' sum", () => {
      const values = makeGeneratedInput({
        numberOfAgents: 200,
        ...brokenRows,
      }) as GeneratedSimFormValues;
      expect(validateGeneratedForm(values, 100, undefined, undefined, "network")).toEqual({
        agentLimitExceeded: true,
      });
      expect(validateGeneratedForm(values, 200, undefined, undefined, "network")).toEqual({});
    });
  });
});

describe("validateCustomForm", () => {
  it("flags agentLimitExceeded when the defined agents exceed maxAgents", () => {
    const errors = validateCustomForm(makeCustomValues(11), 10, 10);
    expect(errors.agentLimitExceeded).toBe(true);
  });

  it("accepts an agent count equal to maxAgents", () => {
    const errors = validateCustomForm(makeCustomValues(10, 10), 10, 10);
    expect(errors).toEqual({});
  });

  it("flags iterationLimitExceeded when iterationLimit exceeds maxIterations", () => {
    const errors = validateCustomForm(makeCustomValues(2, 11), 10, 10);
    expect(errors.iterationLimitExceeded).toBe(true);
    expect(errors.agentLimitExceeded).toBeUndefined();
  });

  it("skips the quotas when no limits are provided (unknown user)", () => {
    const errors = validateCustomForm(makeCustomValues(5000, 99_999));
    expect(errors).toEqual({});
  });

  describe("issue mapping by full path (#122)", () => {
    const validate = (overrides: Partial<CustomSimSchemaInput>) =>
      validateCustomForm(makeCustomInput(overrides) as CustomSimFormValues);
    const withThirdAgent = (patch: Partial<CustomSimSchemaInput["agents"][number]>) =>
      validate({
        agents: [
          { ...baseCustomAgent, name: "Alice" },
          { ...baseCustomAgent, name: "Bob" },
          { ...baseCustomAgent, name: "Carol", ...patch },
        ],
      });
    const withEdge = (patch: Partial<CustomSimSchemaInput["edges"][number]>) =>
      validate({ edges: [{ ...baseCustomEdge, ...patch }] });

    it("maps an empty agents list to customNoAgents", () => {
      expect(validate({ agents: [], edges: [] })).toEqual({
        customNoAgents: true,
        customNoEdges: true,
      });
    });

    it("maps an empty edges list to customNoEdges", () => {
      expect(validate({ edges: [] })).toEqual({ customNoEdges: true });
    });

    it("maps an empty agent name to customAgentInvalid, not customNoAgents", () => {
      expect(withThirdAgent({ name: "" })).toEqual({ customAgentInvalid: true });
    });

    it.each([
      ["belief", { belief: 1.5 }],
      ["toleranceRadius", { toleranceRadius: -0.1 }],
      ["toleranceOffset", { toleranceOffset: 2 }],
    ])("maps an out-of-range %s to customAgentInvalid", (_field, patch) => {
      expect(withThirdAgent(patch)).toEqual({ customAgentInvalid: true });
    });

    it("maps an out-of-range influence to customEdgeInvalid, not customNoEdges", () => {
      expect(withEdge({ influence: 1.5 })).toEqual({ customEdgeInvalid: true });
    });

    it("maps an unfinished edge (no source / target picked) to customEdgeInvalid", () => {
      const errors = withEdge({ source: "", target: "" });
      expect(errors.customEdgeInvalid).toBe(true);
      expect(errors.customNoEdges).toBeUndefined();
    });
  });
});

describe("custom name length limit (#122)", () => {
  // The backend columns are varchar(32): longer names used to make the save roll back silently.
  const atLimit = "N".repeat(MAX_CUSTOM_NAME_LENGTH);
  const overLimit = "N".repeat(MAX_CUSTOM_NAME_LENGTH + 1);

  function withAgentName(name: string): CustomSimSchemaInput {
    return makeCustomInput({
      agents: [
        { ...baseCustomAgent, name },
        { ...baseCustomAgent, name: "Bob" },
      ],
      edges: [{ ...baseCustomEdge, source: name, target: "Bob" }],
    });
  }

  it("is 32 characters, the size of the backend columns", () => {
    expect(MAX_CUSTOM_NAME_LENGTH).toBe(32);
  });

  it("accepts a network name and an agent name of exactly 32 characters", () => {
    expect(customSimSchema.safeParse(makeCustomInput({ networkName: atLimit })).success).toBe(true);
    expect(customSimSchema.safeParse(withAgentName(atLimit)).success).toBe(true);
  });

  it("rejects a 33-character network name with nameTooLong on the networkName path", () => {
    const result = customSimSchema.safeParse(makeCustomInput({ networkName: overLimit }));
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.message === "nameTooLong");
    expect(issue?.path).toEqual(["networkName"]);
  });

  it("rejects a 33-character agent name with nameTooLong on the agent's name path", () => {
    const result = customSimSchema.safeParse(withAgentName(overLimit));
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.message === "nameTooLong");
    expect(issue?.path).toEqual(["agents", 0, "name"]);
  });

  it("maps a long network name to customNetworkNameTooLong only", () => {
    const errors = validateCustomForm(
      makeCustomInput({ networkName: overLimit }) as CustomSimFormValues,
    );
    expect(errors).toEqual({ customNetworkNameTooLong: true });
  });

  it("maps a long agent name to customAgentNameTooLong, not the generic customAgentInvalid", () => {
    const errors = validateCustomForm(withAgentName(overLimit) as CustomSimFormValues);
    expect(errors).toEqual({ customAgentNameTooLong: true });
  });

  it("keeps the empty-name error separate from the length error", () => {
    const errors = validateCustomForm(makeCustomInput({ networkName: "" }) as CustomSimFormValues);
    expect(errors.customNetworkNameEmpty).toBe(true);
    expect(errors.customNetworkNameTooLong).toBeUndefined();
  });
});

describe("custom agent name uniqueness (#122)", () => {
  // custom_agents is keyed by (run_id, name): a repeated name made the save fail with 500.
  function withAgentNames(first: string, second: string, ...rest: string[]): CustomSimSchemaInput {
    return makeCustomInput({
      agents: [first, second, ...rest].map((name) => ({ ...baseCustomAgent, name })),
      edges: [{ ...baseCustomEdge, source: first, target: second }],
    });
  }

  describe("findDuplicateAgentNames", () => {
    it("returns every name used by more than one agent", () => {
      const names = findDuplicateAgentNames([
        { name: "A" },
        { name: "B" },
        { name: "A" },
        { name: "C" },
        { name: "B" },
        { name: "A" },
      ]);
      expect([...names]).toEqual(["A", "B"]);
    });

    it("is case-sensitive, like the backend primary key", () => {
      expect(findDuplicateAgentNames([{ name: "Alice" }, { name: "alice" }]).size).toBe(0);
    });

    it("does not treat names that differ only in whitespace as duplicates", () => {
      expect(findDuplicateAgentNames([{ name: "Alice" }, { name: "Alice " }]).size).toBe(0);
    });

    it("ignores empty names (the required-name rule reports them)", () => {
      expect(findDuplicateAgentNames([{ name: "" }, { name: "" }]).size).toBe(0);
    });
  });

  it("rejects a repeated agent name with duplicateAgentName on the repeat's name path", () => {
    const result = customSimSchema.safeParse(withAgentNames("Alice", "Bob", "Alice"));
    expect(result.success).toBe(false);
    const issues = result.error?.issues.filter((i) => i.message === "duplicateAgentName") ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["agents", 2, "name"]);
  });

  it("reports the repeats in order, so the first one is the name the backend's 400 names", () => {
    const result = customSimSchema.safeParse(withAgentNames("A", "B", "B", "A"));
    const issues = result.error?.issues.filter((i) => i.message === "duplicateAgentName") ?? [];
    expect(issues.map((i) => i.path)).toEqual([
      ["agents", 2, "name"],
      ["agents", 3, "name"],
    ]);
    const first = issues[0];
    expect(first?.code === "custom" ? first.params : undefined).toEqual({ name: "B" });
  });

  it("accepts agent names that differ only by case", () => {
    expect(customSimSchema.safeParse(withAgentNames("Alice", "alice")).success).toBe(true);
  });

  it("maps a repeated name to customAgentNameDuplicate only", () => {
    const errors = validateCustomForm(withAgentNames("Alice", "Bob", "Bob") as CustomSimFormValues);
    expect(errors).toEqual({ customAgentNameDuplicate: true });
  });

  it("leaves two empty names to the required-name rule, without the duplicate flag", () => {
    const errors = validateCustomForm(
      makeCustomInput({
        agents: [
          { ...baseCustomAgent, name: "Alice" },
          { ...baseCustomAgent, name: "Bob" },
          { ...baseCustomAgent, name: "" },
          { ...baseCustomAgent, name: "" },
        ],
      }) as CustomSimFormValues,
    );
    expect(errors).not.toEqual({});
    expect(errors.customAgentNameDuplicate).toBeUndefined();
  });
});
