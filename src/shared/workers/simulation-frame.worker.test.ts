import { beforeEach, describe, expect, it, vi } from "vitest";

// The worker module has side-effecting top-level code (`self.onmessage = ...`)
// and holds a module-private `merger` variable with no reset export. Following
// the repo convention for module-scoped state (see logger.test.ts /
// backend/client.test.ts), each test resets the module registry and
// dynamically re-imports the worker so `self.onmessage` is re-registered and
// `merger` starts fresh (null) every time.

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEADER_BYTES = 36;

/**
 * Builds a single valid slice buffer matching the 36-byte header layout
 * documented in shared/lib/simulation-frame.ts (all little-endian):
 *   0-7 networkId msb · 8-15 networkId lsb · 16-23 runId
 *   24-27 agentCount · 28-31 round · 32-35 startsAt
 * followed by agentCount * 8 bytes of interleaved (public, private) float32
 * belief data and agentCount * 1 byte of speaking flags.
 */
function makeSliceBuffer(opts: {
  round: number;
  startsAt: number;
  agentCount: number;
  runId?: bigint;
  networkMsb?: bigint;
  networkLsb?: bigint;
}): ArrayBuffer {
  const { round, startsAt, agentCount, runId = 1n, networkMsb = 1n, networkLsb = 2n } = opts;
  const size = HEADER_BYTES + 9 * agentCount;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);

  view.setBigInt64(0, networkMsb, true);
  view.setBigInt64(8, networkLsb, true);
  view.setBigInt64(16, runId, true);
  view.setInt32(24, agentCount, true);
  view.setInt32(28, round, true);
  view.setInt32(32, startsAt, true);

  for (let i = 0; i < agentCount; i++) {
    view.setFloat32(HEADER_BYTES + i * 8, 0.5, true);
    view.setFloat32(HEADER_BYTES + i * 8 + 4, 0.5, true);
  }
  for (let i = 0; i < agentCount; i++) {
    view.setUint8(HEADER_BYTES + agentCount * 8 + i, 1);
  }

  return buffer;
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

/** Resets the module registry and re-imports the worker for a clean `merger` state. */
async function loadWorker(): Promise<void> {
  vi.resetModules();
  await import("./simulation-frame.worker");
}

/** Invokes the worker's registered onmessage handler with the given payload. */
function dispatch(data: unknown): void {
  const handler = self.onmessage as ((event: MessageEvent) => void) | null;
  if (!handler) throw new Error("worker did not register self.onmessage");
  handler({ data } as MessageEvent);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("simulation-frame.worker", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(self, "postMessage").mockImplementation(() => {});
  });

  describe("frame message before init", () => {
    it("is a no-op: does not call postMessage and does not throw", async () => {
      await loadWorker();
      const buffer = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });

      expect(() => dispatch({ type: "frame", buffer })).not.toThrow();
      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("init + frame", () => {
    it("init creates a merger, and a completing frame message posts a merged frame", async () => {
      await loadWorker();
      dispatch({ type: "init", agentCount: 2 });

      const buffer = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });
      dispatch({ type: "frame", buffer });

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const [merged, transfer] = postMessageSpy.mock.calls[0] as [
        {
          round: number;
          publicBelief: Float32Array;
          privateBelief: Float32Array;
          speaking: Uint8Array;
        },
        ArrayBuffer[],
      ];
      expect(merged.round).toBe(1);
      expect(Array.from(merged.publicBelief)).toEqual([0.5, 0.5]);
      expect(Array.from(merged.speaking)).toEqual([1, 1]);
      // Transferable list should carry the three underlying buffers.
      expect(transfer).toEqual([
        merged.publicBelief.buffer,
        merged.privateBelief.buffer,
        merged.speaking.buffer,
      ]);
    });

    it("does not post a merged frame while the round is still incomplete", async () => {
      await loadWorker();
      dispatch({ type: "init", agentCount: 4 });

      // Partition only covers agents [0,2) of 4 — round incomplete.
      const buffer = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });
      dispatch({ type: "frame", buffer });

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("replay-buffer message", () => {
    it("does nothing (no postMessage, no throw) when the merger has not been initialized", async () => {
      await loadWorker();
      const buffer = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });

      expect(() => dispatch({ type: "replay-buffer", buffer })).not.toThrow();
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it("walks each concatenated slice, processing them in order", async () => {
      await loadWorker();
      dispatch({ type: "init", agentCount: 2 });

      // Each slice independently completes its own round (agentCount === init
      // agentCount), so if — and only if — both slices are individually
      // processed do we see exactly two postMessage calls, one per round.
      const sliceA = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });
      const sliceB = makeSliceBuffer({ round: 2, startsAt: 0, agentCount: 2 });
      const combined = concatBuffers([sliceA, sliceB]);

      dispatch({ type: "replay-buffer", buffer: combined });

      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      const firstFrame = postMessageSpy.mock.calls[0][0] as { round: number };
      const secondFrame = postMessageSpy.mock.calls[1][0] as { round: number };
      expect(firstFrame.round).toBe(1);
      expect(secondFrame.round).toBe(2);
    });

    it("breaks cleanly on a trailing truncated slice without processing or throwing", async () => {
      await loadWorker();
      dispatch({ type: "init", agentCount: 2 });

      const validSlice = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });
      // A full slice declaring agentCount=5 (81 bytes) truncated to 40 bytes:
      // header (36 bytes) is intact and decodable, but the payload is short,
      // so offset + sliceSize > total and the loop must `break` before
      // calling processSlice on it.
      const truncatedSlice = makeSliceBuffer({ round: 2, startsAt: 0, agentCount: 5 }).slice(0, 40);
      const combined = concatBuffers([validSlice, truncatedSlice]);

      expect(() => dispatch({ type: "replay-buffer", buffer: combined })).not.toThrow();
      // Only the valid leading slice should have produced a merged frame.
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const onlyFrame = postMessageSpy.mock.calls[0][0] as { round: number };
      expect(onlyFrame.round).toBe(1);
    });

    it("terminates the loop normally when the buffer ends exactly on a slice boundary", async () => {
      await loadWorker();
      dispatch({ type: "init", agentCount: 2 });

      const onlySlice = makeSliceBuffer({ round: 1, startsAt: 0, agentCount: 2 });

      expect(() => dispatch({ type: "replay-buffer", buffer: onlySlice })).not.toThrow();
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });
  });
});
