/**
 * Wire-protocol control events emitted by the simulation WebSocket. They
 * belong to the transport layer (this slice) — the `simulation` entity
 * re-exports them for domain consumers, keeping imports flowing downward.
 */
export type WsControlEvent =
  | { event: "topology_ready"; runId: string; networkId: string }
  | { event: "network_started"; runId: string; networkId: string }
  | {
      event: "network_converged";
      runId: string;
      networkId: string;
      finalRound: number;
      consensus: boolean;
    }
  | { event: "run_completed"; runId: string }
  | { event: "error"; message: string };
