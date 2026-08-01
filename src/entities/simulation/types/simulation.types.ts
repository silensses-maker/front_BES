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
  /** Round currently on screen (viewed round — follows the timeline cursor). */
  currentRound: number;
  /** Frame currently on screen — drives the canvas, agent table and histogram. */
  latestFrame: MergedFrame | null;
  /** Latest frame ARRIVED from the live stream, regardless of what's viewed. */
  receivedFrame: MergedFrame | null;
  /** Highest round received from the live stream (the "recibidas" cursor). */
  receivedRound: number;
  /** True while the viewed round is pinned to the live tail. */
  follow: boolean;
  finalRound: number | null;
  /** Verdict from WS network_converged (null until it arrives). */
  consensus: boolean | null;
  error: string | null;
  selectedAgentIndex: number | null;
}
