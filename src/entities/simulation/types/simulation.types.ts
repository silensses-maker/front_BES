import type { TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export type SimulationStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "cancelled"
  | "error";

// Wire-protocol event types live with the WS transport in shared/lib/ws-manager;
// re-exported here so domain consumers keep importing from the entity.
export type { WsControlEvent } from "@/shared/lib/ws-manager";

export interface SimulationState {
  status: SimulationStatus;
  runId: string | null;
  networkId: string | null;
  topology: TopologyResponse | null;
  currentRound: number;
  latestFrame: MergedFrame | null;
  finalRound: number | null;
  error: string | null;
  selectedAgentIndex: number | null;
}
