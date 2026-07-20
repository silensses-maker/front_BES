/**
 * Binary frame format — per openapi.yaml §L913-948, all values little-endian.
 *
 * Header (36 bytes):
 *   0-7   int64  networkId.mostSigBits  (Java UUID long)
 *   8-15  int64  networkId.leastSigBits (Java UUID long)
 *   16-23 int64  runId (Snowflake ID)
 *   24-27 int32  numberOfAgents (this partition)
 *   28-31 int32  round
 *   32-35 int32  startsAt (global index of first agent in this partition)
 *
 * Belief data (numberOfAgents × 8 bytes):
 *   [publicBelief (float32), privateBelief (float32)] × n  — interleaved
 *
 * Speaking data (numberOfAgents × 1 byte):
 *   [isSpeaking (uint8)] × n
 *
 * Partitioning: a single round may emit multiple frames with different startsAt
 * values. Each frame covers [startsAt, startsAt + agentCount). The client must
 * merge partitions keyed by (runId, networkId, round, startsAt).
 */

export interface SimulationFramePartition {
  /** Snowflake ID as decimal string — matches the runId returned by REST endpoints. */
  runId: string;
  /** UUID v4 string reconstructed from Java UUID.getMostSignificantBits() / getLeastSignificantBits(). */
  networkId: string;
  round: number;
  /** Global index of the first agent in this partition. Agent at position i maps to global index startsAt + i. */
  startsAt: number;
  agentCount: number;
  publicBelief: Float32Array;
  privateBelief: Float32Array;
  speaking: Uint8Array;
}

const HEADER_BYTES = 36;

function int64ToHex16(n: bigint): string {
  return BigInt.asUintN(64, n).toString(16).padStart(16, "0");
}

function reconstructUuid(msb: bigint, lsb: bigint): string {
  const m = int64ToHex16(msb);
  const l = int64ToHex16(lsb);
  return `${m.slice(0, 8)}-${m.slice(8, 12)}-${m.slice(12, 16)}-${l.slice(0, 4)}-${l.slice(4)}`;
}

export function parseSimulationFrame(buffer: ArrayBuffer): SimulationFramePartition {
  const view = new DataView(buffer);

  const networkId = reconstructUuid(view.getBigInt64(0, true), view.getBigInt64(8, true));
  const runId = BigInt.asUintN(64, view.getBigInt64(16, true)).toString();
  const agentCount = view.getInt32(24, true);
  const round = view.getInt32(28, true);
  const startsAt = view.getInt32(32, true);

  const publicBelief = new Float32Array(agentCount);
  const privateBelief = new Float32Array(agentCount);

  for (let i = 0; i < agentCount; i++) {
    publicBelief[i] = view.getFloat32(HEADER_BYTES + i * 8, true);
    privateBelief[i] = view.getFloat32(HEADER_BYTES + i * 8 + 4, true);
  }

  // .slice() detaches from the original ArrayBuffer so it can be transferred in Phase 2
  const speaking = new Uint8Array(buffer, HEADER_BYTES + agentCount * 8, agentCount).slice();

  return { runId, networkId, round, startsAt, agentCount, publicBelief, privateBelief, speaking };
}
