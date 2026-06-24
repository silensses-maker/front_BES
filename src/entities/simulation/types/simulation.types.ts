import type { TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export type SimulationStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "cancelled"
  | "error";

export type WsControlEvent =
  | { event: "topology_ready"; runId: string; networkId: string }
  | { event: "network_started"; runId: string; networkId: string }
  | { event: "network_converged"; runId: string; networkId: string; finalRound: number; consensus: boolean }
  | { event: "run_completed"; runId: string }
  | { event: "error"; message: string };

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
