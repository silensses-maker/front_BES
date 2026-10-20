/**
 * Backend REST contract, hand-written: no codegen (#94). Source of truth: the OpenAPI spec of the
 * backend repo, `silensses-maker/belief_evolution_simulator` → `src/main/resources/openapi.yaml`;
 * update this file with every change there. Renamed schemas: Error is BackendError, UserInfo is
 * UserSyncResponse, Agent is AgentSpec, Edge is EdgeSpec; the others keep their spec names.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

export type SaveMode = 0 | 1 | 2;
export type SilenceStrategy = 0 | 1 | 2 | 3;
export type SilenceEffect = 0 | 1 | 2;
export type CognitiveBias = 0 | 1 | 2 | 3 | 4;
export type FrameRetention = "ephemeral" | "persistent";

// ─── Common ───────────────────────────────────────────────────────────────────

/** The `error` codes the frontend branches on: a subset of the spec's, `error` stays open. */
export type BackendErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_body"
  | "usage_limit_exceeded"
  /** 409 — e.g. `DELETE /simulations/{runId}` on a run that already finished (#124). */
  | "conflict";

/** Rejected input of a `400 invalid_body`: body member path (no array indexes) or query param. */
export interface FieldIssue {
  field: string;
  issue: string;
}

/** Body of every non-2xx JSON answer. */
export interface BackendError {
  error: BackendErrorCode | string;
  message: string;
  /** Some `400 invalid_body` answers only. */
  fields?: FieldIssue[];
  /** `422 usage_limit_exceeded` only: the caller's quota. */
  limit?: number;
  /** `422 usage_limit_exceeded` only: the requested value. */
  requested?: number;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UsageLimits {
  maxAgents: number | null;
  maxIterations: number | null;
  densityFactor: number;
  /**
   * Max `numberOfNetworks` of a generated run; `null` = unlimited (#122). Absent when the
   * backend predates the field — callers then fall back to the role table.
   */
  maxNetworks?: number | null;
}

/** Shape returned by POST /api/users/sync */
export interface UserSyncResponse {
  uid: string;
  email: string;
  name: string;
  photo: string | null;
  roles: UserRole[];
  usageLimits: UsageLimits;
  deactivated: boolean;
}

/** Shape returned by GET /api/users/info/{uid}: the sync shape without `photo`. */
export type UserInfoResponse = Omit<UserSyncResponse, "photo">;

/** Shape returned by POST /api/users/me/deactivate */
export interface DeactivateResponse {
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

/**
 * Directed edge of a custom network: `source` influences `target` (the target agent updates its
 * belief from the source's opinion); `influence` is the weight `target` gives to `source`'s
 * opinion and `bias` the cognitive bias `target` applies to it.
 */
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
  /** Null / omitted: the backend draws one in [0, 2^53 − 1] (#127). */
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
  /**
   * Generated runs only: Barabási–Albert `m` the backend actually used —
   * `floor(density × densityFactor)` clamped to `[1, agentsPerNetwork − 1]` (#122).
   */
  effectiveDensity?: number;
  /** Constant path of the persistent WebSocket (`/ws`): the client subscribes there by `runId`. */
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
  /**
   * Seed of a generated run — the one requested, or the one the backend drew in
   * `[0, 2^53 − 1]` when none was — as a decimal string (the column is 64-bit) (#127). The same
   * configuration with the same seed replays the run on the same server, except for runs created
   * before #127 (their stored value is not replayable). `null` for custom runs; absent when the
   * backend predates the field.
   */
  seed?: string | null;
}

/**
 * Shape returned by GET /simulations/{runId}/config (#127): the stored configuration of a
 * GENERATED run (custom runs answer 404). The requested density is not stored: `effectiveDensity`
 * is the Barabási–Albert m the run used, after the role's densityFactor.
 */
export interface GeneratedRunConfig {
  runId: string;
  type: "generated";
  numberOfNetworks: number;
  agentsPerNetwork: number;
  effectiveDensity: number;
  iterationLimit: number;
  stopThreshold: number;
  /** Decimal string, same value as {@link RunSummary.seed}. */
  seed: string;
  frameRetention: FrameRetention;
  /** One row per (silenceStrategy, silenceEffect), sorted by code. */
  agentTypes: AgentType[];
  /** One row per biasType, sorted by code. */
  biasTypes: BiasType[];
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

/**
 * Same semantics as {@link EdgeSpec}, by agent index, for custom and generated networks:
 * `source` influences `target`.
 */
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

// ─── Pagination params ────────────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}
