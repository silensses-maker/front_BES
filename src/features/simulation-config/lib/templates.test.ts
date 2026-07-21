import { describe, expect, it } from "vitest";
import type { GeneratedSimFormValues } from "../types/simulation-config.types";
import { CONSENSUS_PURSUIT_TEMPLATE, POLARIZATION_TEMPLATE } from "./templates";

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
