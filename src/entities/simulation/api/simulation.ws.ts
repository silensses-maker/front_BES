import { simulationsApi } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useSimulationStore } from "../model/simulation.store";
import type { WsControlEvent } from "../types/simulation.types";

const MAX_RECONNECT_ATTEMPTS = 3;

// Codes that signal ticket rejection — do not retry
const NO_RETRY_CODES = new Set([1000, 1008]);

export interface SimulationWsClient {
  connect: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Creates a WS client for the given run.
 *
 * @param runId     - Identifies the simulation run.
 * @param networkId - When provided, only `topology_ready`, `network_started`,
 *                    and `network_converged` events matching this networkId are
 *                    processed; events for other networks are silently dropped.
 *                    Pass `null` to accept the first `topology_ready` event
 *                    regardless of networkId (used in "waiting-for-topology" mode
 *                    before the caller knows which network to watch).
 */
export function createSimulationWsClient(
  runId: string,
  networkId: string | null = null,
): SimulationWsClient {
  let ws: WebSocket | null = null;
  let worker: Worker | null = null;
  let topologyReady = false;
  let reconnectAttempts = 0;
  let destroyed = false;

  const store = useSimulationStore.getState;

  async function openConnection(): Promise<void> {
    const { wsTicket } = await simulationsApi.getWsTicket(runId);

    const baseUrl = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:9000";
    const wsBase = baseUrl.replace(/^http/, "ws");
    const url = `${wsBase}/simulations/${runId}/stream?ticket=${wsTicket}`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      store().setStatus("running");
    };

    ws.onmessage = async (event: MessageEvent) => {
      if (typeof event.data === "string") {
        handleControlEvent(JSON.parse(event.data) as WsControlEvent);
        return;
      }

      // Drop binary frames until topology is loaded (worker is not initialized yet)
      if (!topologyReady) return;

      const buffer: ArrayBuffer =
        event.data instanceof Blob ? await event.data.arrayBuffer() : (event.data as ArrayBuffer);

      worker?.postMessage({ type: "frame", buffer }, [buffer]);
    };

    ws.onerror = () => {
      // onclose fires right after onerror, handle reconnect there
    };

    ws.onclose = (event: CloseEvent) => {
      if (destroyed) return;
      if (NO_RETRY_CODES.has(event.code)) return;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        store().setStatus("connecting");
        openConnection().catch(() => {
          store().setError(`WebSocket reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        });
      } else {
        store().setError(`WebSocket closed unexpectedly (code ${event.code})`);
      }
    };
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

  async function handleControlEvent(msg: WsControlEvent): Promise<void> {
    switch (msg.event) {
      case "topology_ready": {
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setStatus("running");
        // Idempotency: if useSimulationStream's proactive REST fetch already
        // populated the topology for this network, skip the WS-driven refetch.
        // Otherwise the second setTopology re-triggers SimulationCanvas's
        // useEffect and the user sees the graph "restart" mid-warmup.
        const existing = store().topology;
        if (existing !== null && existing.networkId === msg.networkId) {
          worker?.postMessage({ type: "init", agentCount: existing.agentCount });
          topologyReady = true;
          break;
        }
        const topology = await simulationsApi.getTopologyFull(msg.runId, msg.networkId);
        if (topology) {
          // Re-check after the async gap: the proactive REST fetch in
          // useSimulationStream may have won the race and already called
          // setTopology. Calling it again with a new object reference — even
          // with identical data — triggers SimulationCanvas's useEffect([topology])
          // and restarts the layout warmup from scratch.
          const raceWinner = store().topology;
          if (raceWinner === null || raceWinner.networkId !== msg.networkId) {
            store().setTopology(topology);
          }
          worker?.postMessage({ type: "init", agentCount: topology.agentCount });
          topologyReady = true;
        }
        break;
      }
      case "network_started":
        if (!isRelevantNetworkEvent(msg.networkId)) break;
        store().setStatus("running");
        break;
      case "network_converged":
        // per-network event; run-level status stays 'running' until run_completed
        break;
      case "run_completed":
        store().setStatus("completed");
        break;
      case "error":
        store().setError(msg.message);
        break;
    }
  }

  return {
    connect: async () => {
      destroyed = false;
      topologyReady = false;

      worker = new Worker(
        new URL("../../../shared/workers/simulation-frame.worker.ts", import.meta.url),
      );
      worker.onmessage = (event: MessageEvent<MergedFrame>) => {
        store().updateFrame(event.data);
      };

      store().setRunId(runId);
      store().setStatus("connecting");
      await openConnection();
    },

    disconnect: () => {
      destroyed = true;
      ws?.close(1000);
      ws = null;
      worker?.terminate();
      worker = null;
      topologyReady = false;
    },
  };
}
