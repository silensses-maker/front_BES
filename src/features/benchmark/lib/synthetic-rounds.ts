import { createRandom } from "./prng";

/**
 * Seeded per-round beliefs for the repaint benchmark (#126), encoded in the backend's binary
 * frame format so playback goes through the replay's own chunk index + merge path
 * (`indexChunkBuffer` / `mergeRoundFromChunk`) exactly as a persisted run does.
 *
 * Process (a bounded random walk towards consensus): every round each private belief moves a
 * fraction `pull` towards the network mean plus uniform noise of amplitude `noise`, clamped to
 * [0, 1]; an agent speaks with probability `speakingRate`, and its public belief follows its
 * private one only while it speaks (silent agents keep their last public belief). Every round
 * changes every agent's colour, so the repaint has the full per-round work.
 */

const HEADER_BYTES = 36;
const BYTES_PER_AGENT = 9;

export interface SyntheticRoundsOptions {
  runId: string;
  networkId: string;
  initialBeliefs: ArrayLike<number>;
  rounds: number;
  seed: number;
  pull?: number;
  noise?: number;
  speakingRate?: number;
}

/** Byte size of one full-network slice (36-byte header + 9 bytes per agent). */
export function frameSliceBytes(agents: number): number {
  return HEADER_BYTES + BYTES_PER_AGENT * agents;
}

/** Splits a lowercase UUID into the two signed int64 words the Java side writes. */
export function uuidToWords(uuid: string): { msb: bigint; lsb: bigint } {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`Not a UUID: ${uuid}`);
  return {
    msb: BigInt.asIntN(64, BigInt(`0x${hex.slice(0, 16)}`)),
    lsb: BigInt.asIntN(64, BigInt(`0x${hex.slice(16)}`)),
  };
}

function writeSlice(
  view: DataView,
  offset: number,
  header: { msb: bigint; lsb: bigint; runId: bigint; round: number },
  pub: Float32Array,
  priv: Float32Array,
  speaking: Uint8Array,
): void {
  const n = pub.length;
  view.setBigInt64(offset, header.msb, true);
  view.setBigInt64(offset + 8, header.lsb, true);
  view.setBigInt64(offset + 16, header.runId, true);
  view.setInt32(offset + 24, n, true);
  view.setInt32(offset + 28, header.round, true);
  view.setInt32(offset + 32, 0, true);
  const body = offset + HEADER_BYTES;
  for (let i = 0; i < n; i++) {
    view.setFloat32(body + i * 4, pub[i] ?? 0, true);
    view.setFloat32(body + 4 * n + i * 4, priv[i] ?? 0, true);
    view.setUint8(body + 8 * n + i, speaking[i] ?? 0);
  }
}

/**
 * Rounds `0..rounds−1` as ONE concatenated frames body (round 0 = the initial beliefs, everyone
 * speaking), the same layout `GET /frames?from=0&to=rounds−1` returns for a single-partition
 * network.
 */
export function buildSyntheticFramesChunk(options: SyntheticRoundsOptions): ArrayBuffer {
  const { initialBeliefs, rounds, seed } = options;
  const pull = options.pull ?? 0.04;
  const noise = options.noise ?? 0.03;
  const speakingRate = options.speakingRate ?? 0.6;
  const n = initialBeliefs.length;
  if (rounds < 1) throw new Error("rounds must be >= 1");

  const random = createRandom(seed);
  const { msb, lsb } = uuidToWords(options.networkId);
  const runId = BigInt.asIntN(64, BigInt(options.runId));
  const slice = frameSliceBytes(n);
  const buffer = new ArrayBuffer(slice * rounds);
  const view = new DataView(buffer);

  const priv = Float32Array.from(initialBeliefs);
  const pub = Float32Array.from(initialBeliefs);
  const speaking = new Uint8Array(n).fill(1);

  for (let round = 0; round < rounds; round++) {
    if (round > 0) {
      let mean = 0;
      for (let i = 0; i < n; i++) mean += priv[i] ?? 0;
      mean /= Math.max(1, n);
      for (let i = 0; i < n; i++) {
        const current = priv[i] ?? 0;
        const next = current + pull * (mean - current) + noise * (2 * random() - 1);
        priv[i] = next < 0 ? 0 : next > 1 ? 1 : next;
        const speaks = random() < speakingRate;
        speaking[i] = speaks ? 1 : 0;
        if (speaks) pub[i] = priv[i] ?? 0;
      }
    }
    writeSlice(view, round * slice, { msb, lsb, runId, round }, pub, priv, speaking);
  }
  return buffer;
}

/**
 * Maps an ever-increasing playback round onto a ring of `ringRounds` stored rounds, ping-pong
 * (0,1,…,R−1,R−2,…,1,0,1,…) so consecutive rendered rounds stay one step apart.
 */
export function pingPongRound(round: number, ringRounds: number): number {
  if (ringRounds <= 1) return 0;
  const period = 2 * (ringRounds - 1);
  const r = ((Math.floor(round) % period) + period) % period;
  return r < ringRounds ? r : period - r;
}
