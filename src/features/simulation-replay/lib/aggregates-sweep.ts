import { useRoundAggregatesStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { chunkRoundsFor, indexChunkBuffer, mergeRoundFromChunk } from "./replay-chunks";

export interface SweepHandle {
  cancel: () => void;
  /** Resolves when the sweep stops (finished, cancelled or failed). */
  done: Promise<void>;
}

/**
 * Background fill of the round-aggregates store for runs whose frames were not
 * (fully) received live: walks the REST chunks 0→finalRound in order, merging
 * each round and feeding `ingest` — without ever touching the viewed frame.
 *
 * Chunks whose rounds are already all ingested are skipped without fetching
 * (a run watched live end-to-end costs zero extra requests). Buffers are
 * discarded after processing — this path bypasses the playback engine's LRU.
 */
export function startAggregatesSweep(options: {
  runId: string;
  networkId: string;
  agentCount: number;
  finalRound: number;
}): SweepHandle {
  const { runId, networkId, agentCount, finalRound } = options;
  const key = `${runId}|${networkId}`;
  const chunkRounds = chunkRoundsFor(agentCount);
  let cancelled = false;

  const store = useRoundAggregatesStore.getState;

  const isMissing = (round: number): boolean => store().aggregates[round] === undefined;

  const run = async (): Promise<void> => {
    for (let from = 0; from <= finalRound; from += chunkRounds) {
      if (cancelled) return;
      const to = Math.min(from + chunkRounds - 1, finalRound);

      let hasMissing = false;
      for (let r = from; r <= to; r++) {
        if (isMissing(r)) {
          hasMissing = true;
          break;
        }
      }
      if (!hasMissing) continue;

      const buffer = await simulationsApi.getFrames(runId, networkId, { from, to });
      if (cancelled) return;
      if (buffer === null) return; // frames expired mid-sweep — leave sweepDone unset

      const rounds = indexChunkBuffer(buffer);
      const chunk = { from, to, buffer, rounds };
      const sorted = [...rounds.keys()].sort((a, b) => a - b);
      for (const round of sorted) {
        if (cancelled) return;
        if (!isMissing(round)) continue;
        const frame = mergeRoundFromChunk(chunk, round, agentCount);
        if (frame !== null) store().ingest(key, frame);
      }
    }
    if (!cancelled) store().setSweepDone(key);
  };

  const done = run().catch((err: unknown) => {
    logger.error("aggregates-sweep", err);
  });

  return {
    cancel: () => {
      cancelled = true;
    },
    done,
  };
}
