import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SimulationWsClient } from "@/entities/simulation";
import {
  createSimulationWsClient,
  loadTopology,
  useSimulationStore,
  useTopologyLoadStatus,
} from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { useSimulationWsManager } from "@/shared/lib/ws-manager";

/**
 * Loads the network's topology into the store (shared load, #140) unless one arrived meanwhile.
 * A caller that stops waiting (`isCancelled`) only ignores the result.
 */
function prefetchTopology(runId: string, networkId: string, isCancelled: () => boolean): void {
  loadTopology(runId, networkId)
    .then((topo) => {
      if (isCancelled() || topo === null) return;
      const store = useSimulationStore.getState();
      if (store.topology === null) store.setTopology(topo);
    })
    .catch((err: unknown) => {
      if (isCancelled()) return;
      // The failure is visible: the loader's status turns `failed` and the canvas shows its
      // error state with a retry (#128).
      logger.error("useSimulationStream.getTopology", err);
    });
}

/**
 * Connects the WebSocket stream for a given run.
 *
 * @param runId     - The simulation run identifier.
 * @param networkId - The specific network to filter events for. Pass `null`
 *                    when in "waiting-for-first-topology" mode — the hook will
 *                    still connect and accept any `topology_ready` event so the
 *                    caller can navigate to the discovered networkId.
 */
export function useSimulationStream(runId: string, networkId: string | null = null) {
  const { t } = useTranslation();
  const manager = useSimulationWsManager();
  const clientRef = useRef<SimulationWsClient | null>(null);
  // The current mount's lifetime: a retry after unmount (or a run change) does nothing.
  const lifetimeRef = useRef<{ cancelled: boolean } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const status = useSimulationStore((s) => s.status);
  const storeRunId = useSimulationStore((s) => s.runId);
  const storeTopology = useSimulationStore((s) => s.topology);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const finalRound = useSimulationStore((s) => s.finalRound);
  const storeNetworkId = useSimulationStore((s) => s.networkId);
  const error = useSimulationStore((s) => s.error);
  const reset = useSimulationStore((s) => s.reset);

  // Gate topology on the store's runId matching the requested runId.
  // Prevents stale topology from a previous simulation from reaching
  // SimulationCanvas before reset() fires — React runs child effects (canvas)
  // before parent effects (this hook), so without this guard the canvas would
  // start prepareCosmographData with the old topology on every navigation.
  const topology = storeRunId === runId ? storeTopology : null;

  // Topology download status of the watched network, whichever load runs it (#128).
  const topologyLoad = useTopologyLoadStatus(runId, networkId);

  useEffect(() => {
    reset();
    clientRef.current = createSimulationWsClient(runId, networkId, manager);

    const connect = async () => {
      setIsConnecting(true);
      try {
        await clientRef.current?.connect();
      } catch (err) {
        logger.error("useSimulationStream", err);
        toast.error(t("simulation.errorStream"));
      } finally {
        setIsConnecting(false);
      }
    };

    void connect();

    // Proactive topology fetch: the persistent WS replays topology_ready on
    // subscribe, but a REST prefetch races it and ensures the worker is
    // initialised even if the WS replay is delayed (page refresh, reconnect).
    // Shared load (#140): the WS handler joins this download instead of
    // starting its own, and the selector's download of the same network is
    // reused. Cancelling only ignores the result — the download keeps serving
    // the other callers.
    const lifetime = { cancelled: false };
    lifetimeRef.current = lifetime;
    if (networkId !== null) {
      prefetchTopology(runId, networkId, () => lifetime.cancelled);
    }

    return () => {
      lifetime.cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      reset();
    };
  }, [runId, networkId, manager, reset, t]);

  // REST fallback: when the simulation completes but currentRound is still 0,
  // all binary frames arrived before this component mounted (race condition on
  // small/fast simulations). Replay the full frame history via the REST endpoint
  // so the Panel C charts are populated. Requires persistFrames:true (already
  // hardcoded in use-simulation-config.ts). Silently no-ops on 404 (DEBUG runs
  // without frame persistence, or ephemeral frames already expired).
  useEffect(() => {
    if (status !== "completed") return;
    if (currentRound !== 0) return;
    if (finalRound == null || finalRound === 0) return;
    if (storeNetworkId === null) return;
    // Only fall back if topology was received — confirms WS was live and the
    // missed frames are due to a race, not a premature call before the run ends.
    if (topology === null) return;
    if (!clientRef.current) return;

    const client = clientRef.current;
    simulationsApi
      .getFrames(runId, storeNetworkId, { from: 0, to: finalRound })
      .then((buffer) => {
        if (buffer !== null) client.replayBuffer(buffer);
      })
      .catch((err: unknown) => {
        logger.error("useSimulationStream.framesReplayFallback", err);
      });
  }, [status, currentRound, finalRound, storeNetworkId, topology, runId]);

  /**
   * Retry action of the topology error state (#128): loads the network again — joining the
   * download of another caller if one runs meanwhile.
   */
  const retryTopology = useCallback(() => {
    const lifetime = lifetimeRef.current;
    if (networkId === null || lifetime === null || lifetime.cancelled) return;
    prefetchTopology(runId, networkId, () => lifetime.cancelled);
  }, [runId, networkId]);

  return { status, topology, currentRound, error, isConnecting, topologyLoad, retryTopology };
}
