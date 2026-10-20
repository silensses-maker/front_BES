import { describe, expect, it } from "vitest";
import { parseSimulationFrame } from "@/shared/lib/simulation-frame";
import {
  buildSyntheticFramesChunk,
  frameSliceBytes,
  pingPongRound,
  uuidToWords,
} from "./synthetic-rounds";

const NETWORK = "00000126-0000-4000-8000-0000000004d2";
const RUN = "1260000001234";

function slices(buffer: ArrayBuffer, agents: number) {
  const size = frameSliceBytes(agents);
  return Array.from({ length: buffer.byteLength / size }, (_, i) =>
    parseSimulationFrame(buffer.slice(i * size, (i + 1) * size)),
  );
}

describe("buildSyntheticFramesChunk", () => {
  const initial = Array.from({ length: 500 }, (_, i) => (i % 100) / 100);
  const buffer = buildSyntheticFramesChunk({
    runId: RUN,
    networkId: NETWORK,
    initialBeliefs: initial,
    rounds: 30,
    seed: 9,
  });
  const frames = slices(buffer, 500);

  it("writes one full-network slice per round in the wire format", () => {
    expect(buffer.byteLength).toBe(30 * frameSliceBytes(500));
    expect(frames.map((f) => f.round)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    for (const f of frames) {
      expect(f.runId).toBe(RUN);
      expect(f.networkId).toBe(NETWORK);
      expect(f.startsAt).toBe(0);
      expect(f.agentCount).toBe(500);
    }
  });

  it("starts at the initial beliefs with everyone speaking", () => {
    const first = frames[0];
    expect(Array.from(first?.privateBelief ?? [])).toEqual(Array.from(Float32Array.from(initial)));
    expect(Array.from(first?.publicBelief ?? [])).toEqual(Array.from(Float32Array.from(initial)));
    expect(first?.speaking.every((s) => s === 1)).toBe(true);
  });

  it("keeps beliefs in [0, 1], drifts towards consensus and lets ~60 % speak", () => {
    const spread = (values: Float32Array) => Math.max(...values) - Math.min(...values);
    const last = frames[29];
    expect(last).toBeDefined();
    if (!last) return;
    for (const v of last.privateBelief) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(spread(last.privateBelief)).toBeLessThan(
      spread(frames[0]?.privateBelief ?? last.privateBelief),
    );
    const speakingShare = last.speaking.reduce((a, b) => a + b, 0) / 500;
    expect(speakingShare).toBeGreaterThan(0.5);
    expect(speakingShare).toBeLessThan(0.7);
    // Silent agents keep their previous public belief
    const prev = frames[28];
    for (let i = 0; i < 500; i++) {
      if (last.speaking[i] === 0) expect(last.publicBelief[i]).toBe(prev?.publicBelief[i]);
      else expect(last.publicBelief[i]).toBe(last.privateBelief[i]);
    }
  });

  it("is deterministic per seed", () => {
    const again = buildSyntheticFramesChunk({
      runId: RUN,
      networkId: NETWORK,
      initialBeliefs: initial,
      rounds: 30,
      seed: 9,
    });
    expect(new Uint8Array(again)).toEqual(new Uint8Array(buffer));
  });

  it("rejects an empty ring", () => {
    expect(() =>
      buildSyntheticFramesChunk({
        runId: RUN,
        networkId: NETWORK,
        initialBeliefs: [0.5],
        rounds: 0,
        seed: 1,
      }),
    ).toThrow(/rounds/);
  });
});

describe("uuidToWords", () => {
  it("splits a UUID into the signed int64 words of the frame header", () => {
    const { msb, lsb } = uuidToWords("ffffffff-ffff-ffff-0000-000000000001");
    expect(msb).toBe(-1n);
    expect(lsb).toBe(1n);
  });

  it("rejects malformed ids", () => {
    expect(() => uuidToWords("not-a-uuid")).toThrow(/UUID/);
  });
});

describe("pingPongRound", () => {
  it("bounces over the stored rounds", () => {
    expect(Array.from({ length: 10 }, (_, r) => pingPongRound(r, 4))).toEqual([
      0, 1, 2, 3, 2, 1, 0, 1, 2, 3,
    ]);
    expect(pingPongRound(7, 1)).toBe(0);
    expect(pingPongRound(3.9, 4)).toBe(3);
  });
});
