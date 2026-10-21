/// <reference lib="webworker" />
import { computeRoundStats } from "@/shared/lib/round-stats";
import { parseSimulationFrame } from "@/shared/lib/simulation-frame";
import type { MergedFrame } from "./simulation-frame-merger";
import { PartitionMerger } from "./simulation-frame-merger";

type InMessage =
  | { type: "init"; agentCount: number }
  | { type: "frame"; buffer: ArrayBuffer }
  | { type: "replay-buffer"; buffer: ArrayBuffer };

// Slice header layout (see shared/lib/simulation-frame.ts): 36 bytes total,
// with agentCount at int32 offset 24 (little-endian). Each slice's payload is
// 8 bytes × agentCount (beliefs) + 1 byte × agentCount (speaking).
const HEADER_BYTES = 36;
const AGENT_COUNT_OFFSET = 24;

let merger: PartitionMerger | null = null;

/**
 * Posts a completed round with its statistics computed here, off the main thread: the
 * round-aggregates store only copies them (#129). The fine histograms (polarization)
 * travel as transferables too.
 */
function emitMerged(merged: MergedFrame): void {
  const stats = computeRoundStats(merged.publicBelief, merged.privateBelief, merged.speaking, {
    // polarization (#129): remove with src/shared/lib/polarization + src/features/run-polarization
    fineHistograms: __POLARIZATION__,
  });
  const transfer: Transferable[] = [
    merged.publicBelief.buffer,
    merged.privateBelief.buffer,
    merged.speaking.buffer,
  ];
  if (stats.fine !== null) transfer.push(stats.fine.public.buffer, stats.fine.private.buffer);
  (self as DedicatedWorkerGlobalScope).postMessage({ ...merged, stats }, transfer);
}

function processSlice(buffer: ArrayBuffer): void {
  if (!merger) return;
  const partition = parseSimulationFrame(buffer);
  const merged = merger.processPartition(partition);
  if (merged) emitMerged(merged);
}

(self as DedicatedWorkerGlobalScope).onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    merger = new PartitionMerger(msg.agentCount);
    return;
  }

  if (msg.type === "frame") {
    processSlice(msg.buffer);
    return;
  }

  if (msg.type === "replay-buffer" && merger) {
    // Replay endpoint returns N slices concatenated, ordered by (round, startsAt).
    // Walk the buffer slice-by-slice using each header's agentCount to compute size.
    const total = msg.buffer.byteLength;
    let offset = 0;
    while (offset + HEADER_BYTES <= total) {
      const headerView = new DataView(msg.buffer, offset, HEADER_BYTES);
      const agentCount = headerView.getInt32(AGENT_COUNT_OFFSET, true);
      const sliceSize = HEADER_BYTES + 9 * agentCount;
      if (offset + sliceSize > total) break;
      processSlice(msg.buffer.slice(offset, offset + sliceSize));
      offset += sliceSize;
    }
  }
};
