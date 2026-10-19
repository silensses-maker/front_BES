import { simulationsApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";

/**
 * True when a FINISHED run's topology is no longer retained by the backend (#124).
 *
 * Topology snapshots live only in backend memory. Once it no longer holds the run (retention
 * window, memory budget, backend restart), `GET /networks` still lists the networks that have
 * persisted frames, but `GET /topology` answers 202 for good — the viewer could never load, so
 * the page shows its "data no longer available" state instead. A running run is never "gone"
 * (202 there means "not ready yet"). On any request error the answer is `false`, which keeps the
 * previous behaviour (open the viewer).
 */
export async function isFinishedRunTopologyGone(
  runId: string,
  networkId: string,
): Promise<boolean> {
  try {
    const run = await simulationsApi.getById(runId);
    if (run.status === "running") return false;
    // Zero-size page: only the 200 / 202 answer matters.
    const probe = await simulationsApi.getTopology(runId, networkId, {
      agentOffset: 0,
      agentLimit: 0,
      edgeOffset: 0,
      edgeLimit: 0,
    });
    return probe === null;
  } catch (err) {
    logger.error("isFinishedRunTopologyGone", err);
    return false;
  }
}
