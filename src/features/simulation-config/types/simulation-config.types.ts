import type { AgentSpec, EdgeSpec, SaveMode } from "@/shared/api/backend";
import type {
  EncoderCognitiveBias,
  EncoderSilenceEffect,
  EncoderSilenceStrategy,
} from "@/shared/lib/custom-simulation-encoder";

export type { EncoderSilenceStrategy as SilenceStrategy };
export type { EncoderSilenceEffect as SilenceEffect };
export type { EncoderCognitiveBias as CognitiveBias };

/**
 * One agent-type distribution row. There are no threshold/confidence fields:
 * the simulator fixes them itself (THRESHOLD → 0.1; CONFIDENCE → random initial
 * confidence, threshold 0.1) and the API does not accept them (#120).
 */
export interface AgentTypeRow {
  id: string;
  count: number;
  silenceStrategy: EncoderSilenceStrategy;
  silenceEffect: EncoderSilenceEffect;
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
  /**
   * Not editable in the wizard and not sent: requests carry RUN_SAVE_MODE (#133). Kept so JSON
   * import/export and persisted drafts keep their shape.
   */
  saveMode: SaveMode;
  agentTypes: AgentTypeRow[];
  biasTypes: BiasRow[];
}

export interface CustomSimFormValues {
  networkType: "custom";
  networkName: string;
  iterationLimit: number;
  stopThreshold: number;
  /** See GeneratedSimFormValues.saveMode — kept for import/export, never sent (#133). */
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
  /** numberOfNetworks above the role's maxNetworks (#122). */
  networkLimitExceeded?: boolean;
  /** Barabási–Albert density must be lower than the agents per network (#122). */
  densityExceedsAgents?: boolean;
  countsInvalid?: boolean;
  // Custom path
  customNetworkNameEmpty?: boolean;
  /** Network / agent name above MAX_CUSTOM_NAME_LENGTH — the backend columns are varchar(32). */
  customNetworkNameTooLong?: boolean;
  customAgentNameTooLong?: boolean;
  /** Two agents share a name — the backend keys `custom_agents` by (run_id, name) (#122). */
  customAgentNameDuplicate?: boolean;
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
