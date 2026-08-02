import { useCallback, useEffect, useRef, useState } from "react";
import { computeFinalSpread } from "@/features/simulation-data-table";
import { simulationsApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";

/** Fetch all agents — spread needs the full belief range. */
const RESULTS_AGENT_LIMIT = 100_000;

export interface UseFinalSpreadsReturn {
  /** networkId → dispersión final (max−min of final beliefs). */
  finalSpreads: Record<string, number>;
  /**
   * Lazily fetches /results for the given networks — only ids not already
   * cached or in flight are requested (visible-page/list batching keeps the
   * request count bounded; a 202-pending result is retried on a later call).
   */
  requestSpreads: (networkIds: string[]) => void;
}

/**
 * Shared lazy "dispersión final" cache for a run — used by the Redes dataset
 * of the data table (per visible page) and the networks browser (visible
 * list). One instance per owner context (RunView / LiveRunPage selector).
 */
export function useFinalSpreads(runId: string): UseFinalSpreadsReturn {
  const [finalSpreads, setFinalSpreads] = useState<Record<string, number>>({});
  const cachedRef = useRef<Record<string, number>>({});
  const inflightRef = useRef(new Set<string>());

  // New run → fresh cache
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId IS the reset trigger
  useEffect(() => {
    cachedRef.current = {};
    inflightRef.current.clear();
    setFinalSpreads({});
  }, [runId]);

  const requestSpreads = useCallback(
    (networkIds: string[]) => {
      const missing = networkIds.filter(
        (id) => !(id in cachedRef.current) && !inflightRef.current.has(id),
      );
      if (missing.length === 0) return;
      for (const id of missing) inflightRef.current.add(id);

      Promise.all(
        missing.map(async (id) => {
          try {
            const results = await simulationsApi.getResults(runId, id, {
              limit: RESULTS_AGENT_LIMIT,
            });
            if (results === null) return null; // 202 — still pending, retry later
            const spread = computeFinalSpread(results.agents);
            return spread === null ? null : { id, spread };
          } catch (err) {
            logger.error("useFinalSpreads", err);
            return null;
          }
        }),
      ).then((resolved) => {
        for (const id of missing) inflightRef.current.delete(id);
        const additions = resolved.filter((r): r is { id: string; spread: number } => r !== null);
        if (additions.length === 0) return;
        setFinalSpreads((prev) => {
          const next = { ...prev };
          for (const { id, spread } of additions) {
            next[id] = spread;
            cachedRef.current[id] = spread;
          }
          return next;
        });
      });
    },
    [runId],
  );

  return { finalSpreads, requestSpreads };
}
