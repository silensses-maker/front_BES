import type { AgentSpec, EdgeSpec, SaveMode } from "@/shared/api/backend";
import type {
  EncoderCognitiveBias,
  EncoderSilenceEffect,
  EncoderSilenceStrategy,
} from "@/shared/lib/custom-simulation-encoder";

export type { EncoderSilenceStrategy as SilenceStrategy };
export type { EncoderSilenceEffect as SilenceEffect };
export type { EncoderCognitiveBias as CognitiveBias };

export interface AgentTypeRow {
  id: string;
  count: number;
  silenceStrategy: EncoderSilenceStrategy;
  silenceEffect: EncoderSilenceEffect;
  majorityThreshold?: number;
  confidence?: number;
}

export interface BiasRow {
  id: string;
  count: number;
  cognitiveBias: EncoderCognitiveBias;
}

export interface GeneratedSimFormValues {
  networkType: "generated";
  numberOfAgents: number;
  numberOfNetworks: number;
  density: number;
  iterationLimit: number;
  stopThreshold: number;
  seed: number | null;
  saveMode: SaveMode;
  agentTypes: AgentTypeRow[];
  biasTypes: BiasRow[];
}

export interface CustomSimFormValues {
  networkType: "custom";
  networkName: string;
  iterationLimit: number;
  stopThreshold: number;
  saveMode: SaveMode;
  agents: AgentSpec[];
  edges: EdgeSpec[];
}

export type SimFormValues = GeneratedSimFormValues | CustomSimFormValues;

export interface SimConfigValidationErrors {
  // Generated path
  agentCountMismatch?: boolean;
  biasCountMismatch?: boolean;
  stopThresholdOutOfRange?: boolean;
  iterationLimitExceeded?: boolean;
  agentLimitExceeded?: boolean;
  countsInvalid?: boolean;
  // Custom path
  customNetworkNameEmpty?: boolean;
  customNoAgents?: boolean;
  customNoEdges?: boolean;
  customAgentInvalid?: boolean;
  customEdgeInvalid?: boolean;
  customEdgeUnknownAgent?: boolean;
  customEdgeDuplicate?: boolean;
  // Import path
  importInvalid?: boolean;
}

export type NetworkType = "generated" | "custom" | "load";

export const WIZARD_STEPS = ["network", "agents", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number] | "load";
