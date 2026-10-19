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
      /** Canonical field (#119), sent by both the live path and the DB replay. */
      finalRound?: number;
      /** Legacy name of `finalRound` on the live path of backends before #119. */
      round?: number;
      consensus: boolean;
    }
  | { event: "run_completed"; runId: string }
  | { event: "error"; message: string };
