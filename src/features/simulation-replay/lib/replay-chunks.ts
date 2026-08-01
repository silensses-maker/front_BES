import { parseSimulationFrame } from "@/shared/lib/simulation-frame";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { PartitionMerger } from "@/shared/workers/simulation-frame-merger";

/**
 * Chunk helpers for the replay engine. A "chunk" is one HTTP response from
 * GET /simulations/{runId}/networks/{networkId}/frames?from=A&to=B — a
 * concatenation of binary slices (36-byte header + 9 bytes/agent), possibly
 * several slices per round for partitioned networks.
 */

const HEADER_BYTES = 36;
const BYTES_PER_AGENT = 9;
/** Backend caps range requests at 1000 rounds. */
const MAX_ROUNDS_PER_REQUEST = 1000;
/** Target raw size per cached chunk. */
const TARGET_CHUNK_BYTES = 8 * 1024 * 1024;

export interface SliceRange {
  offset: number;
  size: number;
}

export interface IndexedChunk {
  from: number;
  to: number;
  buffer: ArrayBuffer;
  /** round → byte ranges of its partition slices within `buffer`. */
  rounds: Map<number, SliceRange[]>;
}

/** Rounds per range request, adapted to the per-round byte cost of the network. */
export function chunkRoundsFor(agentCount: number): number {
  const bytesPerRound = HEADER_BYTES + BYTES_PER_AGENT * agentCount;
  const rounds = Math.floor(TARGET_CHUNK_BYTES / bytesPerRound);
  return Math.max(1, Math.min(MAX_ROUNDS_PER_REQUEST, rounds));
}

/** Inclusive [from, to] bounds of the chunk containing `round`, clamped to finalRound. */
export function chunkBoundsFor(
  round: number,
  chunkRounds: number,
  finalRound: number,
): { from: number; to: number } {
  const from = Math.floor(round / chunkRounds) * chunkRounds;
  const to = Math.min(from + chunkRounds - 1, finalRound);
  return { from, to };
}

/**
 * Walks a concatenated frames body and indexes each slice by round.
 * A truncated trailing slice is ignored (same tolerance as the WS worker).
 */
export function indexChunkBuffer(buffer: ArrayBuffer): Map<number, SliceRange[]> {
  const rounds = new Map<number, SliceRange[]>();
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + HEADER_BYTES <= buffer.byteLength) {
    const agentCount = view.getInt32(offset + 24, true);
    const round = view.getInt32(offset + 28, true);
    const size = HEADER_BYTES + BYTES_PER_AGENT * agentCount;
    if (agentCount < 0 || offset + size > buffer.byteLength) break;

    const ranges = rounds.get(round);
    if (ranges) {
      ranges.push({ offset, size });
    } else {
      rounds.set(round, [{ offset, size }]);
    }
    offset += size;
  }

  return rounds;
}

/** Reads the round number from the first slice header of a frames body. */
export function readLastRoundHeader(buffer: ArrayBuffer): number {
  return new DataView(buffer).getInt32(28, true);
}

/**
 * Merges all partition slices of `round` into a single frame.
 * A fresh PartitionMerger is created per call: the shared merger is
 * forward-only (drops rounds below the latest seen), which would silently
 * discard backward seeks if an instance were reused across renders.
 */
export function mergeRoundFromChunk(
  chunk: IndexedChunk,
  round: number,
  agentCount: number,
): MergedFrame | null {
  const ranges = chunk.rounds.get(round);
  if (!ranges || ranges.length === 0) return null;

  const merger = new PartitionMerger(agentCount);
  let merged: MergedFrame | null = null;
  for (const { offset, size } of ranges) {
    const partition = parseSimulationFrame(chunk.buffer.slice(offset, offset + size));
    merged = merger.processPartition(partition) ?? merged;
  }
  return merged;
}
