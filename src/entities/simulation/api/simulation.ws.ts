import { simulationsApi } from "@/shared/api/backend";
import { readFrameNetworkId, readFrameRunId } from "@/shared/lib/simulation-frame";
import type { SimulationWsManager } from "@/shared/lib/ws-manager";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useLastRunStore } from "../model/last-run.store";
import { useSimulationStore } from "../model/simulation.store";
import type { WsControlEvent } from "../types/simulation.types";

const FRAME_HEADER_BYTES = 36;

/**
 * Round frame check for a WS binary message: 36-byte header + 9 × numberOfAgents
 * bytes (openapi.yaml `/ws` § "Frame binary") with a plausible header —
 * numberOfAgents > 0, round ≥ 0, startsAt ≥ 0 — so a truncated or foreign
 * binary never reaches the worker.
 *
 * Since #119 the backend no longer sends the topology binary by default
 * (`APP_WS_SEND_TOPOLOGY=false`): round frames are the only binary messages.
 * With that flag on, a topology binary (32 + 4n + 9m bytes) has a frame's size
 * whenever 9m = 5n + 4 and its header also looks plausible, so it would pass.
 */
export function isFrameBinary(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FRAME_HEADER_BYTES) return false;
  const view = new DataView(buffer);
  const numberOfAgents = view.getInt32(24, true);
  if (numberOfAgents <= 0) return false;
  if (buffer.byteLength !== FRAME_HEADER_BYTES + 9 * numberOfAgents) return false;
  return view.getInt32(28, true) >= 0 && view.getInt32(32, true) >= 0;
}

/**
 * Final round of a `network_converged` event: `finalRound` (canonical since
 * #119), falling back to `round` (live path of older backends). Null when
 * neither is a number — never undefined, which `=== null` checks would miss.
 */
export function readFinalRound(
  msg: Extract<WsControlEvent, { event: "network_converged" }>,
): number | null {
  if (typeof msg.finalRound === "number") return msg.finalRound;
  if (typeof msg.round === "number") return msg.round;
  return null;
}

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
      case "network_converged": {
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setNetworkId(msg.networkId);
        // A missing field leaves the store at null, so the /results fallbacks
        // (`finalRound == null`, `consensus === null`) still fill it.
        const finalRound = readFinalRound(msg);
        if (finalRound !== null) store().setFinalRound(finalRound);
        if (typeof msg.consensus === "boolean") store().setConsensus(msg.consensus);
        break;
      }
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

  function handleBinaryFrame(buffer: ArrayBuffer): void {
    if (!isFrameBinary(buffer)) {
      // Not a round frame — e.g. the WS topology binary (CSR adjacency), only
      // sent when the backend runs with APP_WS_SEND_TOPOLOGY=true. The
      // topology comes from REST GET /topology; never feed anything else to
      // the worker (it assumes 36-byte frame headers).
      return;
    }
    // Never feed another run's frame to this run's worker. The manager
    // already routes binaries by the runId in their header (bytes 16-23);
    // this guard holds whoever delivers them — it matters most with
    // `networkId === null`, where the network filter below accepts any frame.
    if (readFrameRunId(buffer) !== runId) {
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
