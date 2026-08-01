import { describe, expect, it } from "vitest";
import {
  chunkBoundsFor,
  chunkRoundsFor,
  type IndexedChunk,
  indexChunkBuffer,
  mergeRoundFromChunk,
  readLastRoundHeader,
} from "./replay-chunks";

// ─── Fixture builder ─────────────────────────────────────────────────────────

interface AgentData {
  pub: number;
  priv: number;
  speaking: number;
}

const NETWORK_ID_MSB = 0x0102030405060708n;
const NETWORK_ID_LSB = 0x090a0b0c0d0e0f10n;
const EXPECTED_NETWORK_ID = "01020304-0506-0708-090a-0b0c0d0e0f10";
const RUN_ID_BIGINT = 0x0100000000000000n;
const EXPECTED_RUN_ID = RUN_ID_BIGINT.toString();

function buildSlice(round: number, startsAt: number, agents: AgentData[]): ArrayBuffer {
  const agentCount = agents.length;
  const buffer = new ArrayBuffer(36 + agentCount * 9);
  const view = new DataView(buffer);
  view.setBigInt64(0, NETWORK_ID_MSB, true);
  view.setBigInt64(8, NETWORK_ID_LSB, true);
  view.setBigInt64(16, RUN_ID_BIGINT, true);
  view.setInt32(24, agentCount, true);
  view.setInt32(28, round, true);
  view.setInt32(32, startsAt, true);
  for (let i = 0; i < agentCount; i++) {
    view.setFloat32(36 + i * 8, agents[i]!.pub, true);
    view.setFloat32(36 + i * 8 + 4, agents[i]!.priv, true);
    view.setUint8(36 + agentCount * 8 + i, agents[i]!.speaking);
  }
  return buffer;
}

function concat(...buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

function agentsFor(count: number, base: number): AgentData[] {
  return Array.from({ length: count }, (_, i) => ({
    pub: base + i * 0.01,
    priv: 1 - (base + i * 0.01),
    speaking: i % 2,
  }));
}

function chunkFrom(buffer: ArrayBuffer, from: number, to: number): IndexedChunk {
  return { from, to, buffer, rounds: indexChunkBuffer(buffer) };
}

// ─── chunkRoundsFor ──────────────────────────────────────────────────────────

describe("chunkRoundsFor", () => {
  it("caps at 1000 rounds for small networks", () => {
    expect(chunkRoundsFor(10)).toBe(1000);
    expect(chunkRoundsFor(900)).toBe(1000);
  });

  it("shrinks with agent count", () => {
    // 100k agents → 36 + 900_000 bytes/round → ~9 rounds per 8 MiB
    const rounds = chunkRoundsFor(100_000);
    expect(rounds).toBeGreaterThanOrEqual(1);
    expect(rounds).toBeLessThan(20);
  });

  it("never returns less than 1", () => {
    expect(chunkRoundsFor(10_000_000)).toBe(1);
  });
});

// ─── chunkBoundsFor ──────────────────────────────────────────────────────────

describe("chunkBoundsFor", () => {
  it("aligns to chunk boundaries", () => {
    expect(chunkBoundsFor(0, 100, 999)).toEqual({ from: 0, to: 99 });
    expect(chunkBoundsFor(99, 100, 999)).toEqual({ from: 0, to: 99 });
    expect(chunkBoundsFor(100, 100, 999)).toEqual({ from: 100, to: 199 });
    expect(chunkBoundsFor(250, 100, 999)).toEqual({ from: 200, to: 299 });
  });

  it("clamps the last chunk to finalRound", () => {
    expect(chunkBoundsFor(950, 100, 973)).toEqual({ from: 900, to: 973 });
  });
});

// ─── indexChunkBuffer ────────────────────────────────────────────────────────

describe("indexChunkBuffer", () => {
  it("indexes single-slice rounds", () => {
    const buffer = concat(
      buildSlice(0, 0, agentsFor(4, 0.1)),
      buildSlice(1, 0, agentsFor(4, 0.2)),
      buildSlice(2, 0, agentsFor(4, 0.3)),
    );
    const rounds = indexChunkBuffer(buffer);
    expect([...rounds.keys()]).toEqual([0, 1, 2]);
    const sliceSize = 36 + 4 * 9;
    expect(rounds.get(1)).toEqual([{ offset: sliceSize, size: sliceSize }]);
  });

  it("groups multiple partitions of the same round", () => {
    const buffer = concat(
      buildSlice(5, 0, agentsFor(3, 0.1)),
      buildSlice(5, 3, agentsFor(3, 0.4)),
      buildSlice(6, 0, agentsFor(3, 0.2)),
    );
    const rounds = indexChunkBuffer(buffer);
    expect(rounds.get(5)).toHaveLength(2);
    expect(rounds.get(6)).toHaveLength(1);
  });

  it("returns an empty map for an empty buffer", () => {
    expect(indexChunkBuffer(new ArrayBuffer(0)).size).toBe(0);
  });

  it("ignores a truncated trailing slice", () => {
    const full = buildSlice(0, 0, agentsFor(4, 0.1));
    const truncated = buildSlice(1, 0, agentsFor(4, 0.2)).slice(0, 40);
    const rounds = indexChunkBuffer(concat(full, truncated));
    expect([...rounds.keys()]).toEqual([0]);
  });
});

// ─── readLastRoundHeader ─────────────────────────────────────────────────────

describe("readLastRoundHeader", () => {
  it("reads the round from the first slice header", () => {
    const buffer = buildSlice(742, 0, agentsFor(2, 0.1));
    expect(readLastRoundHeader(buffer)).toBe(742);
  });
});

// ─── mergeRoundFromChunk ─────────────────────────────────────────────────────

describe("mergeRoundFromChunk", () => {
  it("merges a single-partition round into a full frame", () => {
    const agents = agentsFor(4, 0.1);
    const chunk = chunkFrom(buildSlice(3, 0, agents), 0, 9);

    const frame = mergeRoundFromChunk(chunk, 3, 4);

    expect(frame).not.toBeNull();
    expect(frame!.round).toBe(3);
    expect(frame!.runId).toBe(EXPECTED_RUN_ID);
    expect(frame!.networkId).toBe(EXPECTED_NETWORK_ID);
    expect(frame!.publicBelief[0]).toBeCloseTo(0.1, 5);
    expect(frame!.publicBelief[3]).toBeCloseTo(0.13, 5);
    expect(frame!.speaking[1]).toBe(1);
  });

  it("merges multi-partition rounds by global agent index", () => {
    const partA = agentsFor(3, 0.1);
    const partB = agentsFor(3, 0.5);
    const chunk = chunkFrom(concat(buildSlice(7, 0, partA), buildSlice(7, 3, partB)), 0, 9);

    const frame = mergeRoundFromChunk(chunk, 7, 6);

    expect(frame).not.toBeNull();
    expect(frame!.publicBelief[0]).toBeCloseTo(0.1, 5);
    expect(frame!.publicBelief[3]).toBeCloseTo(0.5, 5);
    expect(frame!.publicBelief[5]).toBeCloseTo(0.52, 5);
  });

  it("merges rounds in backward order (fresh merger per call)", () => {
    const chunk = chunkFrom(
      concat(buildSlice(2, 0, agentsFor(4, 0.2)), buildSlice(5, 0, agentsFor(4, 0.5))),
      0,
      9,
    );

    const later = mergeRoundFromChunk(chunk, 5, 4);
    const earlier = mergeRoundFromChunk(chunk, 2, 4);

    expect(later).not.toBeNull();
    expect(earlier).not.toBeNull();
    expect(earlier!.round).toBe(2);
    expect(earlier!.publicBelief[0]).toBeCloseTo(0.2, 5);
  });

  it("returns null for a round not present in the chunk", () => {
    const chunk = chunkFrom(buildSlice(1, 0, agentsFor(2, 0.1)), 0, 9);
    expect(mergeRoundFromChunk(chunk, 99, 2)).toBeNull();
  });

  it("returns null when a partition is missing (incomplete round)", () => {
    const chunk = chunkFrom(buildSlice(4, 0, agentsFor(3, 0.1)), 0, 9);
    expect(mergeRoundFromChunk(chunk, 4, 6)).toBeNull();
  });
});
