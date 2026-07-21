// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

export type SaveMode = 0 | 1 | 2;
export type SilenceStrategy = 0 | 1 | 2 | 3;
export type SilenceEffect = 0 | 1 | 2;
export type CognitiveBias = 0 | 1 | 2 | 3 | 4;
export type FrameRetention = "ephemeral" | "persistent";

// ─── Common ───────────────────────────────────────────────────────────────────

export type BackendErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_body"
  | "usage_limit_exceeded"
  | "rate_limited";

export interface BackendError {
  error: BackendErrorCode | string;
  message: string;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UsageLimits {
  maxAgents: number | null;
  maxIterations: number | null;
  densityFactor: number;
}

/** Shape returned by POST /api/users/sync and GET /api/users/info/{uid} */
export interface UserSyncResponse {
  uid: string;
  email: string;
  name: string;
  photo: string | null;
  roles: UserRole[];
  usageLimits: UsageLimits;
  deactivated: boolean;
}

export interface RoleActionResponse {
  uid: string;
  role: string;
  action: string;
}

// ─── Simulations — shared sub-types ──────────────────────────────────────────

export interface AgentType {
  silenceStrategy: SilenceStrategy;
  silenceEffect: SilenceEffect;
  count: number;
}

export interface BiasType {
  biasType: CognitiveBias;
  /** Total number of edges in the network (not agents). */
  count: number;
}

export interface AgentSpec {
  name: string;
  belief: number;
  toleranceRadius: number;
  toleranceOffset: number;
  silenceStrategy: SilenceStrategy;
  silenceEffect: SilenceEffect;
}

export interface EdgeSpec {
  source: string;
  target: string;
  influence: number;
  bias: CognitiveBias;
}

// ─── Simulations — request bodies ─────────────────────────────────────────────

export interface GeneratedRunRequest {
  numberOfNetworks: number;
  density: number;
  iterationLimit: number;
  stopThreshold: number;
  seed?: number | null;
  saveMode: SaveMode;
  agentTypes: AgentType[];
  biasTypes: BiasType[];
  persistFrames?: boolean;
  frameRetention?: FrameRetention;
}

export interface CustomRunRequest {
  name: string;
  iterationLimit: number;
  stopThreshold: number;
  saveMode: SaveMode;
  agents: AgentSpec[];
  edges: EdgeSpec[];
  persistFrames?: boolean;
  frameRetention?: FrameRetention;
}

// ─── Simulations — response shapes ───────────────────────────────────────────

/** Shape returned by POST /simulations/generated and POST /simulations/custom */
export interface SimCreated {
  runId: string;
  status: "running";
  networkCount: number;
  channelId: string;
  wsTicket: string;
  wsUrl: string;
}

/** Shape returned by GET /simulations/{runId} and items in GET /simulations/mine */
export interface RunSummary {
  id: string;
  type: "generated" | "custom";
  name: string | null;
  status: "running" | "completed" | "cancelled" | "error";
  networkCount: number;
  iterationLimit: number;
  stopThreshold: number;
  createdAt: string;
}

export interface SimulationListResponse {
  runs: RunSummary[];
  limit: number;
  offset: number;
}

export interface RunCancelledResponse {
  runId: string;
  cancelled: boolean;
}

export interface NetworkListResponse {
  runId: string;
  networks: string[];
}

// ─── Topology ─────────────────────────────────────────────────────────────────

export interface TopologyAgent {
  index: number;
  name: string | null;
  initialBelief: number;
  toleranceRadius: number;
  toleranceOffset: number;
  silenceStrategy: SilenceStrategy;
  silenceEffect: SilenceEffect;
}

export interface TopologyEdge {
  source: number;
  target: number;
  influence: number;
  bias: CognitiveBias;
}

export interface TopologyResponse {
  runId: string;
  networkId: string;
  agentCount: number;
  edgeCount: number;
  agentOffset: number;
  agentLimit: number;
  edgeOffset: number;
  edgeLimit: number;
  agents: TopologyAgent[];
  edges: TopologyEdge[];
}

export interface TopologyParams {
  agentOffset?: number;
  agentLimit?: number;
  edgeOffset?: number;
  edgeLimit?: number;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface ResultAgent {
  index: number;
  name: string | null;
  finalBelief: number;
  publicBelief: number;
}

export interface ResultsResponse {
  runId: string;
  networkId: string;
  finalRound: number;
  consensus: boolean;
  agentCount: number;
  offset: number;
  limit: number;
  agents: ResultAgent[];
}

export interface ResultsParams {
  offset?: number;
  limit?: number;
}

// ─── WebSocket ticket ─────────────────────────────────────────────────────────

export interface WsTicketResponse {
  wsTicket: string;
}

// ─── Pagination params ────────────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}
