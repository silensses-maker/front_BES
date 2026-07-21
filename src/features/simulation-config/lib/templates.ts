import type { GeneratedSimFormValues } from "../types/simulation-config.types";

export const CONSENSUS_PURSUIT_TEMPLATE: GeneratedSimFormValues = {
  networkType: "generated",
  numberOfAgents: 10,
  numberOfNetworks: 1,
  density: 2,
  iterationLimit: 100,
  stopThreshold: 0.01,
  seed: null,
  saveMode: 1,
  agentTypes: [
    { id: "cp-a0", count: 8, silenceStrategy: 0, silenceEffect: 0 },
    { id: "cp-a1", count: 2, silenceStrategy: 2, silenceEffect: 1, majorityThreshold: 0.4 },
  ],
  biasTypes: [{ id: "cp-b0", count: 34, cognitiveBias: 0 }],
};

export const POLARIZATION_TEMPLATE: GeneratedSimFormValues = {
  networkType: "generated",
  numberOfAgents: 10,
  numberOfNetworks: 1,
  density: 3,
  iterationLimit: 200,
  stopThreshold: 0.001,
  seed: null,
  saveMode: 1,
  agentTypes: [
    { id: "pol-a0", count: 5, silenceStrategy: 1, silenceEffect: 1, majorityThreshold: 0.6 },
    { id: "pol-a1", count: 5, silenceStrategy: 1, silenceEffect: 2, majorityThreshold: 0.6 },
  ],
  biasTypes: [
    { id: "pol-b0", count: 29, cognitiveBias: 1 },
    { id: "pol-b1", count: 19, cognitiveBias: 2 },
  ],
};
