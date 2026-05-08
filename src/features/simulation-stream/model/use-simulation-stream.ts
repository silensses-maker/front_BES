import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SimulationWsClient } from "@/entities/simulation";
import { createSimulationWsClient, useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";

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
  const clientRef = useRef<SimulationWsClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const status = useSimulationStore((s) => s.status);
  const storeRunId = useSimulationStore((s) => s.runId);
  const storeTopology = useSimulationStore((s) => s.topology);
  const currentRound = useSimulationStore((s) => s.currentRound);
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
    clientRef.current = createSimulationWsClient(runId, networkId);

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

    // Refresh resilience: the backend only emits `topology_ready` once per
    // network lifetime. On page refresh / reconnect the WS will not re-fire
    // that event, so we proactively fetch the topology if we have a networkId.
    // The store check below guards against the race where topology_ready also
    // triggers a fetch — see simulation.ws.ts for the symmetric post-await guard.
    let topologyCancelled = false;
    if (networkId !== null) {
      simulationsApi
        .getTopologyFull(runId, networkId)
        .then((topology) => {
          if (topologyCancelled || topology === null) return;
          // Only set if the store doesn't already have it (WS may have won the race)
          const current = useSimulationStore.getState().topology;
          if (current === null) {
            useSimulationStore.getState().setTopology(topology);
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
      // Clear the store on unmount so the next simulation's first render
      // doesn't read stale topology/status from this session.
      reset();
    };
  }, [runId, networkId, reset, t]);

  return { status, topology, currentRound, error, isConnecting };
}
