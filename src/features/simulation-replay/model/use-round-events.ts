import { useMemo } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { detectRoundEvents, type RoundEvent, type RunEnd } from "../lib/round-events";

/**
 * Reactive client-side event detection over the received prefix of the
 * per-round aggregates. Recomputes when new rounds are ingested (aggregates
 * `version`), the run finishes, or the verdict arrives.
 */
export function useRoundEvents(): RoundEvent[] {
  const version = useRoundAggregatesStore((s) => s.version);
  const status = useSimulationStore((s) => s.status);
  const finalRound = useSimulationStore((s) => s.finalRound);
  const consensus = useSimulationStore((s) => s.consensus);
  const receivedRound = useSimulationStore((s) => s.receivedRound);

  return useMemo(() => {
    const { aggregates, maxRound } = useRoundAggregatesStore.getState();
    const finished = status === "completed" || status === "cancelled";
    const end: RunEnd | null =
      finished && status === "completed" ? { finalRound: finalRound ?? maxRound, consensus } : null;
    const upTo = Math.max(receivedRound, maxRound);
    void version; // subscription trigger — buffers are mutable, version is the signal
    return detectRoundEvents(aggregates, upTo, end);
  }, [version, status, finalRound, consensus, receivedRound]);
}
