import { simulationsApi } from "@/shared/api/backend";
import { readFrameNetworkId } from "@/shared/lib/simulation-frame";
import type { SimulationWsManager } from "@/shared/lib/ws-manager";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useLastRunStore } from "../model/last-run.store";
import { useSimulationStore } from "../model/simulation.store";
import type { WsControlEvent } from "../types/simulation.types";

export interface SimulationWsClient {
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Feeds a binary buffer (one or more concatenated slices, same wire format as
   * the WS) into the worker. Used by the REST replay fallback when frames were
   * missed during the WS handshake window. No-op until the worker has been
   * initialized via `topology_ready`.
   */
  replayBuffer: (buffer: ArrayBuffer) => void;
}

/**
 * Creates a WS handler for the given run that delegates to the singleton
 * SimulationWsManager.
 *
 * @param runId     - Identifies the simulation run.
 * @param networkId - When provided, only `topology_ready`, `network_started`,
 *                    and `network_converged` events matching this networkId are
 *                    processed; events for other networks are silently dropped.
 *                    Pass `null` to accept the first `topology_ready` event
 *                    regardless of networkId (used in "waiting-for-topology" mode
 *                    before the caller knows which network to watch).
 * @param manager   - The singleton SimulationWsManager from context.
 */
export function createSimulationWsClient(
  runId: string,
  networkId: string | null = null,
  manager: SimulationWsManager,
): SimulationWsClient {
  let worker: Worker | null = null;
  let topologyReady = false;
  // Frames that arrive before the worker is initialized (topology not yet
  // loaded). Drained into the worker the moment topologyReady becomes true.
  let pendingFrames: ArrayBuffer[] = [];
  let unsubTopology: (() => void) | null = null;

  const store = useSimulationStore.getState;

  /** Mirrors run-level lifecycle into the persisted last-run store (header
   *  chip / rail dot), guarded so a stale client can't clobber a newer run. */
  function mirrorLastRunStatus(status: "completed" | "error"): void {
    const lastRun = useLastRunStore.getState();
    if (lastRun.runId === runId) lastRun.setStatus(status);
  }

  /**
   * Returns true when the event should be processed.
   * Per-network events are gated by networkId when one is provided.
   * When networkId is null we accept the first topology_ready from any network.
   */
  function isRelevantNetworkEvent(eventNetworkId: string): boolean {
    if (networkId === null) return true;
    return eventNetworkId === networkId;
  }

  function drainPendingFrames(): void {
    for (const buf of pendingFrames) {
      worker?.postMessage({ type: "frame", buffer: buf }, [buf]);
    }
    pendingFrames = [];
  }

  async function handleControlEvent(msg: WsControlEvent): Promise<void> {
    switch (msg.event) {
      case "topology_ready": {
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setStatus("running");
        // Idempotency: if useSimulationStream's proactive REST fetch already
        // populated the topology for this network, skip the WS-driven refetch.
        const existing = store().topology;
        if (existing !== null && existing.networkId === msg.networkId) {
          if (!topologyReady) {
            worker?.postMessage({ type: "init", agentCount: existing.agentCount });
            topologyReady = true;
            drainPendingFrames();
          }
          break;
        }
        const topology = await simulationsApi.getTopologyFull(msg.runId, msg.networkId);
        if (topology) {
          const raceWinner = store().topology;
          if (raceWinner === null || raceWinner.networkId !== msg.networkId) {
            store().setTopology(topology);
          }
          worker?.postMessage({ type: "init", agentCount: topology.agentCount });
          topologyReady = true;
          drainPendingFrames();
        }
        break;
      }
      case "network_started":
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setStatus("running");
        break;
      case "network_converged":
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setNetworkId(msg.networkId);
        store().setFinalRound(msg.finalRound);
        store().setConsensus(msg.consensus);
        break;
      case "run_completed":
        store().setStatus("completed");
        mirrorLastRunStatus("completed");
        break;
      case "error":
        store().setError(msg.message);
        mirrorLastRunStatus("error");
        break;
    }
  }

  function isFrameBinary(buffer: ArrayBuffer): boolean {
    // Frame binary: 36-byte header + 9 × numberOfAgents bytes payload.
    // Topology binary: 32-byte header + variable CSR payload. Both share the
    // numberOfAgents int32 at offset 24, so we use the total-size identity from
    // openapi.yaml § "Discriminating binaries" to tell them apart.
    if (buffer.byteLength < 36) return false;
    const numberOfAgents = new DataView(buffer).getInt32(24, true);
    return buffer.byteLength === 36 + 9 * numberOfAgents;
  }

  function handleBinaryFrame(buffer: ArrayBuffer): void {
    if (!isFrameBinary(buffer)) {
      // WS topology binary (CSR adjacency). Agent properties (name, beliefs,
      // strategies) still come from REST GET /topology, so we skip the CSR
      // here. If we ever need WS-driven edges, parse it on the main thread —
      // never feed it to the worker (the worker assumes 36-byte frame headers).
      return;
    }
    // Multi-network runs stream EVERY network's frames on the same socket:
    // drop other networks' frames here, before the worker — the forward-only
    // merger and the round cursors must only ever see the watched network
    // (otherwise "Ronda 552 de 8": another network's rounds pollute recibidas).
    if (networkId !== null && readFrameNetworkId(buffer) !== networkId) {
      return;
    }
    if (!topologyReady) {
      // Worker not initialized yet — buffer frame until topology arrives.
      pendingFrames.push(buffer);
      return;
    }
    worker?.postMessage({ type: "frame", buffer }, [buffer]);
  }

  return {
    connect: async () => {
      topologyReady = false;
      pendingFrames = [];

      worker = new Worker(
        new URL("../../../shared/workers/simulation-frame.worker.ts", import.meta.url),
      );
      worker.onmessage = (event: MessageEvent<MergedFrame>) => {
        // Live path: advances the "recibidas" cursor; renders only in follow mode
        store().ingestLiveFrame(event.data);
        const lastRun = useLastRunStore.getState();
        if (lastRun.runId === runId) lastRun.setRound(event.data.round);
      };

      store().setRunId(runId);
      store().setStatus("connecting");

      // Handle reconnects: topology_ready fires only once per network lifetime.
      // If topology lands in the store from the proactive REST fetch before (or
      // instead of) the WS event, this subscription catches it and initialises
      // the worker so binary frames are not silently dropped.
      unsubTopology = useSimulationStore.subscribe((state) => {
        if (topologyReady) return;
        const topo = state.topology;
        if (topo === null) return;
        if (networkId !== null && topo.networkId !== networkId) return;
        worker?.postMessage({ type: "init", agentCount: topo.agentCount });
        topologyReady = true;
        drainPendingFrames();
        unsubTopology?.();
        unsubTopology = null;
      });

      // Register with the manager — events and binary frames come through callbacks
      manager.subscribe(
        runId,
        (event: WsControlEvent) => {
          handleControlEvent(event).catch(() => {});
        },
        handleBinaryFrame,
      );
    },

    disconnect: () => {
      unsubTopology?.();
      unsubTopology = null;
      manager.unsubscribe(runId);
      worker?.terminate();
      worker = null;
      topologyReady = false;
      pendingFrames = [];
    },

    replayBuffer: (buffer: ArrayBuffer) => {
      if (!topologyReady || !worker) return;
      worker.postMessage({ type: "replay-buffer", buffer }, [buffer]);
    },
  };
}
