import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSimulationFrame, readFrameRunId } from "./simulation-frame";

// ─── Fixture builder ─────────────────────────────────────────────────────────

interface AgentData {
  pub: number;
  priv: number;
  speaking: number;
}

/**
 * Builds a well-formed little-endian binary frame for testing, in the backend's
 * block layout: [n × public float32][n × private float32][n × speaking uint8].
 * networkId is reconstructed from the two int64 halves following Java UUID encoding.
 */
function buildFrameBuffer({
  networkIdMsb,
  networkIdLsb,
  runIdBigInt,
  agentCount,
  round,
  startsAt,
  agents,
}: {
  networkIdMsb: bigint;
  networkIdLsb: bigint;
  runIdBigInt: bigint;
  agentCount: number;
  round: number;
  startsAt: number;
  agents: AgentData[];
}): ArrayBuffer {
  const buffer = new ArrayBuffer(36 + agentCount * 8 + agentCount);
  const view = new DataView(buffer);
  view.setBigInt64(0, networkIdMsb, true);
  view.setBigInt64(8, networkIdLsb, true);
  view.setBigInt64(16, runIdBigInt, true);
  view.setInt32(24, agentCount, true);
  view.setInt32(28, round, true);
  view.setInt32(32, startsAt, true);
  const privateBase = 36 + agentCount * 4;
  for (let i = 0; i < agentCount; i++) {
    view.setFloat32(36 + i * 4, agents[i]!.pub, true);
    view.setFloat32(privateBase + i * 4, agents[i]!.priv, true);
  }
  const speakingBase = 36 + agentCount * 8;
  for (let i = 0; i < agentCount; i++) {
    view.setUint8(speakingBase + i, agents[i]!.speaking);
  }
  return buffer;
}

// ─── Shared fixture values ────────────────────────────────────────────────────
//
// networkId UUID "01020304-0506-0708-090a-0b0c0d0e0f10":
//   MSB bytes [0-7] of UUID → int64 BE = 0x0102030405060708
//   LSB bytes [8-15] of UUID → int64 BE = 0x090a0b0c0d0e0f10
//
// runId Snowflake = 0x0100000000000000 = 72057594037927936

const NETWORK_ID_MSB = 0x0102030405060708n;
const NETWORK_ID_LSB = 0x090a0b0c0d0e0f10n;
const EXPECTED_NETWORK_ID = "01020304-0506-0708-090a-0b0c0d0e0f10";

const RUN_ID_BIGINT = 0x0100000000000000n;
const EXPECTED_RUN_ID = RUN_ID_BIGINT.toString(); // "72057594037927936"

const AGENTS_PARTITION_A: AgentData[] = [
  { pub: 0.1, priv: 0.9, speaking: 1 },
  { pub: 0.2, priv: 0.8, speaking: 0 },
  { pub: 0.3, priv: 0.7, speaking: 1 },
  { pub: 0.4, priv: 0.6, speaking: 0 },
  { pub: 0.5, priv: 0.5, speaking: 1 },
];

const AGENTS_PARTITION_B: AgentData[] = [
  { pub: 0.6, priv: 0.4, speaking: 0 },
  { pub: 0.7, priv: 0.3, speaking: 1 },
  { pub: 0.8, priv: 0.2, speaking: 0 },
  { pub: 0.9, priv: 0.1, speaking: 1 },
  { pub: 1.0, priv: 0.0, speaking: 0 },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("parseSimulationFrame", () => {
  describe("header parsing", () => {
    it("reconstructs networkId UUID from MSB/LSB int64 pair (little-endian)", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 1,
        startsAt: 0,
        agents: [{ pub: 0, priv: 0, speaking: 0 }],
      });
      expect(parseSimulationFrame(buf).networkId).toBe(EXPECTED_NETWORK_ID);
    });

    it("reconstructs networkId correctly when LSB has the high bit set (signed int64 negative)", () => {
      // 0xf000000000000000n → signed int64 is negative; UUID hex must still be correct
      const buf = buildFrameBuffer({
        networkIdMsb: 0x0000000000000000n,
        networkIdLsb: 0xf000000000000000n,
        runIdBigInt: 1n,
        agentCount: 1,
        round: 1,
        startsAt: 0,
        agents: [{ pub: 0, priv: 0, speaking: 0 }],
      });
      expect(parseSimulationFrame(buf).networkId).toBe("00000000-0000-0000-f000-000000000000");
    });

    it("decodes runId as Snowflake decimal string", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 1,
        startsAt: 0,
        agents: [{ pub: 0, priv: 0, speaking: 0 }],
      });
      expect(parseSimulationFrame(buf).runId).toBe(EXPECTED_RUN_ID);
    });

    it("reads round correctly as little-endian int32", () => {
      // round = 0x00000101 = 257; if parsed big-endian it would be 0x01010000 = 16842752
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 257,
        startsAt: 0,
        agents: [{ pub: 0, priv: 0, speaking: 0 }],
      });
      expect(parseSimulationFrame(buf).round).toBe(257);
    });

    it("reads startsAt correctly", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 1,
        startsAt: 50000,
        agents: [{ pub: 0, priv: 0, speaking: 0 }],
      });
      expect(parseSimulationFrame(buf).startsAt).toBe(50000);
    });

    it("reads agentCount correctly", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 1,
        startsAt: 0,
        agents: AGENTS_PARTITION_A,
      });
      expect(parseSimulationFrame(buf).agentCount).toBe(5);
    });
  });

  describe("belief data parsing", () => {
    it("reads publicBelief and privateBelief from their separate blocks", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 3,
        startsAt: 0,
        agents: AGENTS_PARTITION_A,
      });
      const { publicBelief, privateBelief } = parseSimulationFrame(buf);
      for (let i = 0; i < 5; i++) {
        expect(publicBelief[i]).toBeCloseTo(AGENTS_PARTITION_A[i]!.pub, 5);
        expect(privateBelief[i]).toBeCloseTo(AGENTS_PARTITION_A[i]!.priv, 5);
      }
    });

    it("regression: old big-endian parser would misread publicBelief[0]", () => {
      // The old parser used getFloat32(..., false) (big-endian).
      // 0.1 stored as LE bytes = [CD CC CC 3D]; reading those bytes as BE yields a garbage value.
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 1,
        startsAt: 0,
        agents: [{ pub: 0.1, priv: 0.9, speaking: 1 }],
      });
      const { publicBelief } = parseSimulationFrame(buf);
      const bigEndianMisparse = new DataView(buf).getFloat32(36, false);
      expect(publicBelief[0]).toBeCloseTo(0.1, 5);
      expect(bigEndianMisparse).not.toBeCloseTo(0.1, 5);
    });

    it("regression (#118): maps each agent's public/private pair from the block layout", () => {
      // The backend (AgentProcessor.sendRoundToWebSocketServer) writes the beliefs
      // as two blocks through one float view: put(public × n), then put(private × n).
      // The old parser read them as interleaved pairs (36 + 8i, 36 + 8i + 4), which
      // gave agent i the values of agents 2i and 2i+1 and hid public ≠ private.
      const pub = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66];
      const priv = [0.91, 0.82, 0.73, 0.64, 0.05, 0.16];
      const speak = [1, 0, 0, 1, 1, 0];
      const n = pub.length;
      const buf = new ArrayBuffer(36 + 9 * n);
      const view = new DataView(buf);
      view.setInt32(24, n, true);
      view.setInt32(28, 12, true);
      view.setInt32(32, 0, true);
      let offset = 36;
      for (const v of [...pub, ...priv]) {
        view.setFloat32(offset, v, true);
        offset += 4;
      }
      for (const s of speak) {
        view.setUint8(offset, s);
        offset += 1;
      }

      const frame = parseSimulationFrame(buf);
      for (let i = 0; i < n; i++) {
        expect(frame.publicBelief[i]).toBeCloseTo(pub[i]!, 5);
        expect(frame.privateBelief[i]).toBeCloseTo(priv[i]!, 5);
        expect(frame.speaking[i]).toBe(speak[i]);
      }

      // What the old interleaved reading returned for agent 0's private belief:
      // agent 1's public value.
      const oldPrivate0 = view.getFloat32(36 + 4, true);
      expect(oldPrivate0).toBeCloseTo(pub[1]!, 5);
      expect(frame.privateBelief[0]).not.toBeCloseTo(oldPrivate0, 5);
    });
  });

  describe("speaking data parsing", () => {
    it("reads isSpeaking bytes correctly after belief data", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 3,
        startsAt: 0,
        agents: AGENTS_PARTITION_A,
      });
      const { speaking } = parseSimulationFrame(buf);
      expect(Array.from(speaking)).toEqual([1, 0, 1, 0, 1]);
    });

    it("returns a detached Uint8Array — mutating original buffer has no effect", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 2,
        round: 1,
        startsAt: 0,
        agents: [
          { pub: 0, priv: 0, speaking: 1 },
          { pub: 0, priv: 0, speaking: 0 },
        ],
      });
      const { speaking } = parseSimulationFrame(buf);
      // Mutate the speaking region of the original buffer
      new DataView(buf).setUint8(36 + 2 * 8, 0xff);
      expect(speaking[0]).toBe(1); // unchanged — the Uint8Array was copied
    });
  });

  describe("partition support — 10 agents split into 2 × 5", () => {
    it("partition A (startsAt=0) parses independently", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 7,
        startsAt: 0,
        agents: AGENTS_PARTITION_A,
      });
      const frame = parseSimulationFrame(buf);
      expect(frame.runId).toBe(EXPECTED_RUN_ID);
      expect(frame.networkId).toBe(EXPECTED_NETWORK_ID);
      expect(frame.round).toBe(7);
      expect(frame.startsAt).toBe(0);
      expect(frame.agentCount).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(frame.publicBelief[i]).toBeCloseTo(AGENTS_PARTITION_A[i]!.pub, 5);
        expect(frame.privateBelief[i]).toBeCloseTo(AGENTS_PARTITION_A[i]!.priv, 5);
        expect(frame.speaking[i]).toBe(AGENTS_PARTITION_A[i]!.speaking);
      }
    });

    it("partition B (startsAt=5) parses independently", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 7,
        startsAt: 5,
        agents: AGENTS_PARTITION_B,
      });
      const frame = parseSimulationFrame(buf);
      expect(frame.startsAt).toBe(5);
      expect(frame.agentCount).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(frame.publicBelief[i]).toBeCloseTo(AGENTS_PARTITION_B[i]!.pub, 5);
        expect(frame.privateBelief[i]).toBeCloseTo(AGENTS_PARTITION_B[i]!.priv, 5);
        expect(frame.speaking[i]).toBe(AGENTS_PARTITION_B[i]!.speaking);
      }
    });

    it("both partitions share the same runId, networkId and round", () => {
      const bufA = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 7,
        startsAt: 0,
        agents: AGENTS_PARTITION_A,
      });
      const bufB = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 5,
        round: 7,
        startsAt: 5,
        agents: AGENTS_PARTITION_B,
      });
      const a = parseSimulationFrame(bufA);
      const b = parseSimulationFrame(bufB);
      expect(a.runId).toBe(b.runId);
      expect(a.networkId).toBe(b.networkId);
      expect(a.round).toBe(b.round);
    });
  });

  describe("return shape", () => {
    it("returns an object with all required SimulationFramePartition fields", () => {
      const buf = buildFrameBuffer({
        networkIdMsb: NETWORK_ID_MSB,
        networkIdLsb: NETWORK_ID_LSB,
        runIdBigInt: RUN_ID_BIGINT,
        agentCount: 1,
        round: 1,
        startsAt: 0,
        agents: [{ pub: 0.5, priv: 0.5, speaking: 1 }],
      });
      const frame = parseSimulationFrame(buf);
      expect(frame).toHaveProperty("runId");
      expect(frame).toHaveProperty("networkId");
      expect(frame).toHaveProperty("round");
      expect(frame).toHaveProperty("startsAt");
      expect(frame).toHaveProperty("agentCount");
      expect(frame.publicBelief).toBeInstanceOf(Float32Array);
      expect(frame.privateBelief).toBeInstanceOf(Float32Array);
      expect(frame.speaking).toBeInstanceOf(Uint8Array);
    });
  });

  // ─── Real backend frames ──────────────────────────────────────────────────
  //
  // Byte-for-byte copies of `network_frames.frame` (what GET /frames returns and
  // what the WS stream sends) from a local 40-agent run split into two
  // partitions (startsAt 0 → 32 agents, startsAt 32 → 8 agents).
  // No agent in this run diverges (no MEMORY effect), so public === private for
  // every agent — an equality that only holds when the bytes are read as blocks.

  describe("real backend frames (__fixtures__)", () => {
    const REAL_RUN_ID = "342521980018098176";
    const REAL_NETWORK_ID = "0019fc5d-9a84-f1f7-9573-5864db9fc473";

    // Path-based on purpose: happy-dom replaces the global URL, so a file:// URL
    // built with `new URL(..., import.meta.url)` would not resolve to disk.
    function loadFixture(name: string): ArrayBuffer {
      return new Uint8Array(readFileSync(join(import.meta.dirname, "__fixtures__", name))).buffer;
    }

    it("round 0, startsAt 0: decodes the header", () => {
      const buf = loadFixture("ws-frame-round0.bin");
      const frame = parseSimulationFrame(buf);
      expect(buf.byteLength).toBe(36 + 9 * 32);
      expect(frame.runId).toBe(REAL_RUN_ID);
      expect(frame.networkId).toBe(REAL_NETWORK_ID);
      expect(frame.agentCount).toBe(32);
      expect(frame.round).toBe(0);
      expect(frame.startsAt).toBe(0);
    });

    it("round 0, startsAt 0: public === private for every agent, with the initial beliefs", () => {
      const buf = loadFixture("ws-frame-round0.bin");
      const { publicBelief, privateBelief, speaking } = parseSimulationFrame(buf);
      // Initial beliefs repeat 1.0, 0.9, 0.1, 0.0 across agents.
      const initial = [1, Math.fround(0.9), Math.fround(0.1), 0];
      for (let i = 0; i < 32; i++) {
        expect(privateBelief[i]).toBe(publicBelief[i]);
        expect(publicBelief[i]).toBe(initial[i % 4]);
        expect(speaking[i]).toBe(1);
      }
    });

    it("round 0, startsAt 0: the old interleaved reading pairs values of different agents", () => {
      const view = new DataView(loadFixture("ws-frame-round0.bin"));
      // Agent 0's "private" under the old parser is agent 1's belief (0.9 vs 1.0).
      expect(view.getFloat32(36, true)).toBe(1);
      expect(view.getFloat32(36 + 4, true)).toBe(Math.fround(0.9));
      for (let i = 0; i < 32; i++) {
        expect(view.getFloat32(36 + i * 8, true)).not.toBe(view.getFloat32(36 + i * 8 + 4, true));
      }
    });

    it("round 1, startsAt 32: decodes a non-zero partition with silent agents", () => {
      const buf = loadFixture("ws-frame-round1-starts32.bin");
      const frame = parseSimulationFrame(buf);
      expect(buf.byteLength).toBe(36 + 9 * 8);
      expect(frame.runId).toBe(REAL_RUN_ID);
      expect(frame.networkId).toBe(REAL_NETWORK_ID);
      expect(frame.agentCount).toBe(8);
      expect(frame.round).toBe(1);
      expect(frame.startsAt).toBe(32);

      // Global agents 32..39 after one update; every agent is silent in this round.
      const expected = [0.483, 0.583, 0.425, 0.525, 0.483, 0.583, 0.425, 0.325];
      for (let i = 0; i < 8; i++) {
        expect(frame.privateBelief[i]).toBe(frame.publicBelief[i]);
        expect(frame.publicBelief[i]).toBeCloseTo(expected[i]!, 6);
        expect(frame.speaking[i]).toBe(0);
      }
    });
  });
});

describe("readFrameRunId", () => {
  const frameWithRunId = (runIdBigInt: bigint): ArrayBuffer =>
    buildFrameBuffer({
      networkIdMsb: NETWORK_ID_MSB,
      networkIdLsb: NETWORK_ID_LSB,
      runIdBigInt,
      agentCount: 1,
      round: 3,
      startsAt: 0,
      agents: [{ pub: 0, priv: 0, speaking: 0 }],
    });

  it("reads the runId at bytes 16-23 as the decimal string parseSimulationFrame returns", () => {
    const buf = frameWithRunId(RUN_ID_BIGINT);
    expect(readFrameRunId(buf)).toBe(EXPECTED_RUN_ID);
    expect(readFrameRunId(buf)).toBe(parseSimulationFrame(buf).runId);
  });

  it("reads it as unsigned 64-bit, consistently with parseSimulationFrame", () => {
    const buf = frameWithRunId(-1n);
    expect(readFrameRunId(buf)).toBe("18446744073709551615");
    expect(readFrameRunId(buf)).toBe(parseSimulationFrame(buf).runId);
  });

  it("reads it from any binary long enough to hold it (e.g. a topology header)", () => {
    const header = new ArrayBuffer(24);
    new DataView(header).setBigUint64(16, 342521980018098176n, true);
    expect(readFrameRunId(header)).toBe("342521980018098176");
  });

  it("returns null when the buffer is too short to carry a runId", () => {
    expect(readFrameRunId(new ArrayBuffer(23))).toBeNull();
    expect(readFrameRunId(new ArrayBuffer(0))).toBeNull();
  });
});
