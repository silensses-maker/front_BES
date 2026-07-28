import { useEffect, useRef, useState } from "react";
import { simulationsApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";

const POLL_INTERVAL_MS = 4000;

export type NetworkConsensusStatus = "pending" | "consensus" | "no-consensus";

export interface NetworkConsensusEntry {
  status: NetworkConsensusStatus;
  finalRound: number | null;
}

const PENDING_ENTRY: NetworkConsensusEntry = { status: "pending", finalRound: null };

/**
 * Polls GET /simulations/{runId}/networks/{networkId}/results for every id in
 * networkIds that hasn't resolved yet. The endpoint returns 202 until the
 * network converges (or hits the iteration limit), then 200 with `consensus`.
 * Stops polling an id once it resolves; stops the interval entirely once
 * every id has resolved or the component unmounts.
 */
export function useNetworkConsensus(
  runId: string,
  networkIds: string[],
): Record<string, NetworkConsensusEntry> {
  const [entries, setEntries] = useState<Record<string, NetworkConsensusEntry>>({});

  // Stabilize the array reference by content so a caller passing an inline
  // literal doesn't tear down and restart the poll effect on every render,
  // discarding in-flight results. Mutating a ref during render to cache a
  // derived value is the standard React pattern for this.
  const idsRef = useRef(networkIds);
  if (idsRef.current.join(",") !== networkIds.join(",")) {
    idsRef.current = networkIds;
  }
  const stableIds = idsRef.current;

  useEffect(() => {
    setEntries((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of stableIds) {
        if (!(id in next)) {
          next[id] = PENDING_ENTRY;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stableIds]);

  useEffect(() => {
    if (stableIds.length === 0) return;

    // Source of truth for "which ids are already resolved" during this effect's
    // lifetime — kept outside React state because state updates are async and
    // would lag behind by one tick if used to decide when to stop polling.
    const resolved = new Set<string>();
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      const pendingIds = stableIds.filter((id) => !resolved.has(id));
      if (pendingIds.length === 0) return;

      const results = await Promise.all(
        pendingIds.map(async (id) => {
          try {
            const data = await simulationsApi.getResults(runId, id, { limit: 0 });
            return { id, data };
          } catch (err) {
            logger.error("useNetworkConsensus", err);
            return { id, data: undefined };
          }
        }),
      );

      if (cancelled) return;

      const resolvedNow = results.filter(
        (r): r is { id: string; data: NonNullable<(typeof r)["data"]> } => r.data != null,
      );
      if (resolvedNow.length > 0) {
        setEntries((prev) => {
          const next = { ...prev };
          for (const { id, data } of resolvedNow) {
            next[id] = {
              status: data.consensus ? "consensus" : "no-consensus",
              finalRound: data.finalRound,
            };
          }
          return next;
        });
        for (const { id } of resolvedNow) resolved.add(id);
      }

      if (!cancelled && resolved.size === stableIds.length && interval) {
        clearInterval(interval);
        interval = undefined;
      }
    };

    void poll();
    interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [runId, stableIds]);

  return entries;
}
