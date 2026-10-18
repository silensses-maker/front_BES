/**
 * Binary frame format — per openapi.yaml (`/ws`, "Frame binary"), all values
 * little-endian. Total size: 36 + 9 × numberOfAgents bytes.
 *
 * Header (36 bytes):
 *   0-7   int64  networkId.mostSigBits  (Java UUID long)
 *   8-15  int64  networkId.leastSigBits (Java UUID long)
 *   16-23 int64  runId (Snowflake ID)
 *   24-27 int32  numberOfAgents (this partition)
 *   28-31 int32  round
 *   32-35 int32  startsAt (global index of first agent in this partition)
 *
 * Belief data (numberOfAgents × 8 bytes) — two consecutive blocks, NOT interleaved:
 *   36 .. 36+4n-1     [publicBelief (float32)] × n   — agent i at 36 + 4i
 *   36+4n .. 36+8n-1  [privateBelief (float32)] × n  — agent i at 36 + 4n + 4i
 *
 * Speaking data (numberOfAgents × 1 byte):
 *   36+8n .. 36+9n-1  [isSpeaking (uint8)] × n       — agent i at 36 + 8n + i
 *
 * Source of truth: AgentProcessor.sendRoundToWebSocketServer (backend) puts the
 * public block (beliefBuffer) and then the private block (belief) through one
 * float view. Persisted /frames slices are byte copies of that same buffer.
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

/**
 * Reads ONLY the network UUID from a frame header — cheap relevance check so
 * multi-network runs can drop other networks' frames before the worker.
 */
export function readFrameNetworkId(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  return reconstructUuid(view.getBigInt64(0, true), view.getBigInt64(8, true));
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
  const privateBase = HEADER_BYTES + agentCount * 4;
  const speakingBase = HEADER_BYTES + agentCount * 8;

  for (let i = 0; i < agentCount; i++) {
    publicBelief[i] = view.getFloat32(HEADER_BYTES + i * 4, true);
    privateBelief[i] = view.getFloat32(privateBase + i * 4, true);
  }

  // .slice() detaches from the original ArrayBuffer so it can be transferred in Phase 2
  const speaking = new Uint8Array(buffer, speakingBase, agentCount).slice();

  return { runId, networkId, round, startsAt, agentCount, publicBelief, privateBelief, speaking };
}
