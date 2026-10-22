import { describe, expect, it } from "vitest";
// By file path: the entity index pulls the Firebase chain into the test environment.
import { ROLE_LIMITS } from "@/entities/user/lib/permissions";
import type { GeneratedSimFormValues } from "../types/simulation-config.types";
import { CONSENSUS_PURSUIT_TEMPLATE, fitIterationLimit, POLARIZATION_TEMPLATE } from "./templates";
import { generatedSimSchema } from "./validation";

describe("CONSENSUS_PURSUIT_TEMPLATE", () => {
  it("matches the shape of GeneratedSimFormValues", () => {
    const template: GeneratedSimFormValues = CONSENSUS_PURSUIT_TEMPLATE;
    expect(template).toBeDefined();
  });

  it("has networkType set to generated", () => {
    expect(CONSENSUS_PURSUIT_TEMPLATE.networkType).toBe("generated");
  });

  it("has numberOfAgents set to 10", () => {
    expect(CONSENSUS_PURSUIT_TEMPLATE.numberOfAgents).toBe(10);
  });

  it("has agentTypes array with 2 agents with correct ids and counts", () => {
    const { agentTypes } = CONSENSUS_PURSUIT_TEMPLATE;
    expect(agentTypes).toHaveLength(2);
    expect(agentTypes[0]?.id).toBe("cp-a0");
    expect(agentTypes[0]?.count).toBe(8);
    expect(agentTypes[1]?.id).toBe("cp-a1");
    expect(agentTypes[1]?.count).toBe(2);
  });

  it("has biasTypes array with 1 bias type", () => {
    const { biasTypes } = CONSENSUS_PURSUIT_TEMPLATE;
    expect(biasTypes).toHaveLength(1);
    expect(biasTypes[0]?.id).toBe("cp-b0");
  });
});

describe("POLARIZATION_TEMPLATE", () => {
  it("matches the shape of GeneratedSimFormValues", () => {
    const template: GeneratedSimFormValues = POLARIZATION_TEMPLATE;
    expect(template).toBeDefined();
  });

  it("has networkType set to generated", () => {
    expect(POLARIZATION_TEMPLATE.networkType).toBe("generated");
  });

  it("has numberOfAgents set to 10", () => {
    expect(POLARIZATION_TEMPLATE.numberOfAgents).toBe(10);
  });

  it("has agentTypes array with 2 agents with correct ids and counts", () => {
    const { agentTypes } = POLARIZATION_TEMPLATE;
    expect(agentTypes).toHaveLength(2);
    expect(agentTypes[0]?.id).toBe("pol-a0");
    expect(agentTypes[0]?.count).toBe(5);
    expect(agentTypes[1]?.id).toBe("pol-a1");
    expect(agentTypes[1]?.count).toBe(5);
  });

  it("has biasTypes array with 2 bias types with correct ids", () => {
    const { biasTypes } = POLARIZATION_TEMPLATE;
    expect(biasTypes).toHaveLength(2);
    expect(biasTypes[0]?.id).toBe("pol-b0");
    expect(biasTypes[1]?.id).toBe("pol-b1");
  });
});

describe("templates and the simulator-fixed values (#120)", () => {
  const templates = [
    ["CONSENSUS_PURSUIT_TEMPLATE", CONSENSUS_PURSUIT_TEMPLATE],
    ["POLARIZATION_TEMPLATE", POLARIZATION_TEMPLATE],
  ] as const;

  it.each(templates)("%s has no threshold/confidence fields on its agent rows", (_, template) => {
    for (const row of template.agentTypes) {
      expect(row).not.toHaveProperty("majorityThreshold");
      expect(row).not.toHaveProperty("confidence");
      expect(Object.keys(row).sort()).toEqual(["count", "id", "silenceEffect", "silenceStrategy"]);
    }
  });

  it.each(templates)("%s passes generatedSimSchema", (_, template) => {
    const result = generatedSimSchema.safeParse(template);
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });
});

describe("templates and the role quotas", () => {
  const templates = [
    ["CONSENSUS_PURSUIT_TEMPLATE", CONSENSUS_PURSUIT_TEMPLATE],
    ["POLARIZATION_TEMPLATE", POLARIZATION_TEMPLATE],
  ] as const;

  // Only the iteration limit is fitted to the quota when a template is applied; agents and
  // networks must fit the lowest role as they are.
  it.each(templates)("%s fits the Guest agent and network caps", (_, template) => {
    expect(template.numberOfAgents).toBeLessThanOrEqual(ROLE_LIMITS.Guest.maxAgents);
    expect(template.numberOfNetworks).toBeLessThanOrEqual(ROLE_LIMITS.Guest.maxNetworks);
  });

  it.each(templates)("%s passes generatedSimSchema with the Guest iteration cap", (_, template) => {
    const fitted = fitIterationLimit(template, ROLE_LIMITS.Guest.maxIterations);
    expect(fitted.iterationLimit).toBe(ROLE_LIMITS.Guest.maxIterations);
    expect(generatedSimSchema.safeParse(fitted).success).toBe(true);
  });
});

describe("fitIterationLimit", () => {
  it("caps the iteration limit and keeps every other value", () => {
    expect(fitIterationLimit(POLARIZATION_TEMPLATE, 10)).toEqual({
      ...POLARIZATION_TEMPLATE,
      iterationLimit: 10,
    });
  });

  it.each([
    null,
    undefined,
    Infinity,
    200,
    500,
  ])("returns the same object when it fits (%s)", (cap) => {
    expect(fitIterationLimit(POLARIZATION_TEMPLATE, cap)).toBe(POLARIZATION_TEMPLATE);
  });
});
