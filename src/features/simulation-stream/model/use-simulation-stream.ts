import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SimulationWsClient } from "@/entities/simulation";
import { createSimulationWsClient, useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";
import { useSimulationWsManager } from "@/shared/lib/ws-manager";

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

  useEffect(() => {
    reset();
    clientRef.current = createSimulationWsClient(runId, networkId, manager);

    const connect = async () => {
      setIsConnecting(true);
      try {
        await clientRef.current?.connect();
      } catch (err) {
        logger.error("useSimulationStream", err);
        if (isErrorCode(err, "rate_limited")) {
          toast.error(t("simulation.errorRateLimited"));
        } else if (isErrorCode(err, "forbidden")) {
          toast.error(t("simulation.errorForbidden"));
        } else {
          toast.error(t("simulation.errorStream"));
        }
      } finally {
        setIsConnecting(false);
      }
    };

    connect();

    // Proactive topology fetch: the persistent WS replays topology_ready on
    // subscribe, but a REST prefetch races it and ensures the worker is
    // initialised even if the WS replay is delayed (page refresh, reconnect).
    let topologyCancelled = false;
    if (networkId !== null) {
      simulationsApi
        .getTopologyFull(runId, networkId)
        .then((topo) => {
          if (topologyCancelled || topo === null) return;
          const current = useSimulationStore.getState().topology;
          if (current === null) {
            useSimulationStore.getState().setTopology(topo);
          }
        })
        .catch((err: unknown) => {
          if (topologyCancelled) return;
          logger.error("useSimulationStream.getTopology", err);
        });
    }

    return () => {
      topologyCancelled = true;
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

  return { status, topology, currentRound, error, isConnecting };
}
