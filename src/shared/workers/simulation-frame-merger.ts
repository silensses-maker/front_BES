import type { SimulationFramePartition } from "@/shared/lib/simulation-frame";

export interface MergedFrame {
  runId: string;
  networkId: string;
  round: number;
  publicBelief: Float32Array;
  privateBelief: Float32Array;
  speaking: Uint8Array;
}

interface RoundBuffer {
  runId: string;
  networkId: string;
  publicBelief: Float32Array;
  privateBelief: Float32Array;
  speaking: Uint8Array;
  agentsArrived: number;
  partitionsArrived: Set<number>;
}

// Discard rounds more than this many steps behind the latest to prevent memory leak
const EVICTION_THRESHOLD = 10;

/**
 * Merges ordered partitions for a round into a single contiguous frame.
 * A round may arrive as multiple partitions with different startsAt values.
 * When all agents [0, agentCount) are covered, a complete MergedFrame is returned.
 */
export class PartitionMerger {
  private readonly agentCount: number;
  private readonly pending = new Map<number, RoundBuffer>();
  private latestRound = -1;

  constructor(agentCount: number) {
    this.agentCount = agentCount;
  }

  processPartition(partition: SimulationFramePartition): MergedFrame | null {
    const { round, startsAt, agentCount: partCount, runId, networkId } = partition;

    // Advance latest round and evict stale entries
    if (round > this.latestRound) {
      this.latestRound = round;
      for (const r of this.pending.keys()) {
        if (this.latestRound - r > EVICTION_THRESHOLD) {
          this.pending.delete(r);
        }
      }
    }

    // Drop partitions for rounds already superseded
    if (round < this.latestRound) return null;

    // Allocate buffer for this round on first partition
    if (!this.pending.has(round)) {
      this.pending.set(round, {
        runId,
        networkId,
        publicBelief: new Float32Array(this.agentCount),
        privateBelief: new Float32Array(this.agentCount),
        speaking: new Uint8Array(this.agentCount),
        agentsArrived: 0,
        partitionsArrived: new Set(),
      });
    }

    const rb = this.pending.get(round)!;

    // Ignore duplicate partitions for the same startsAt
    if (rb.partitionsArrived.has(startsAt)) return null;
    rb.partitionsArrived.add(startsAt);

    // Write slice into the aggregated buffer
    rb.publicBelief.set(partition.publicBelief, startsAt);
    rb.privateBelief.set(partition.privateBelief, startsAt);
    rb.speaking.set(partition.speaking, startsAt);
    rb.agentsArrived += partCount;

    if (rb.agentsArrived < this.agentCount) return null;

    // Round is complete — emit and clean up
    this.pending.delete(round);
    return {
      runId: rb.runId,
      networkId: rb.networkId,
      round,
      publicBelief: rb.publicBelief,
      privateBelief: rb.privateBelief,
      speaking: rb.speaking,
    };
  }
}
