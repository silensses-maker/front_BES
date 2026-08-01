import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { useReplayEngine } from "./use-replay-engine";

// ─── Module mocks ────────────────────────────────────────────────────────────

const { mockUpdateFrame, mockSetFinalRound, mockGetState } = vi.hoisted(() => ({
  mockUpdateFrame: vi.fn(),
  mockSetFinalRound: vi.fn(),
  mockGetState: vi.fn(),
}));

vi.mock("@/entities/simulation", () => ({
  useSimulationStore: { getState: mockGetState },
}));

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    getFrames: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: vi.fn(),
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// ─── rAF harness ─────────────────────────────────────────────────────────────

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafIdCounter: number;

/** Fires all pending rAF callbacks once per timestamp, in order. */
function fireFrames(...timestamps: number[]) {
  for (const ts of timestamps) {
    const pending = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const cb of pending) {
      cb(ts);
    }
  }
}

// ─── Binary fixtures ─────────────────────────────────────────────────────────

const AGENT_COUNT = 4;

function buildSlice(round: number, startsAt: number, agentCount = AGENT_COUNT): ArrayBuffer {
  const buffer = new ArrayBuffer(36 + agentCount * 9);
  const view = new DataView(buffer);
  view.setBigInt64(0, 0x0102030405060708n, true);
  view.setBigInt64(8, 0x090a0b0c0d0e0f10n, true);
  view.setBigInt64(16, 0x0100000000000000n, true);
  view.setInt32(24, agentCount, true);
  view.setInt32(28, round, true);
  view.setInt32(32, startsAt, true);
  for (let i = 0; i < agentCount; i++) {
    view.setFloat32(36 + i * 8, round / 100 + i * 0.001, true);
    view.setFloat32(36 + i * 8 + 4, 0.5, true);
    view.setUint8(36 + agentCount * 8 + i, i % 2);
  }
  return buffer;
}

function buildChunk(rounds: number[]): ArrayBuffer {
  const slices = rounds.map((r) => buildSlice(r, 0));
  const total = slices.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const s of slices) {
    out.set(new Uint8Array(s), offset);
    offset += s.byteLength;
  }
  return out.buffer;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

type FramesQuery = { round: number | "last" } | { from: number; to: number };

/** Mocks getFrames: `last` → final-round slice; ranges resolved via `chunks` map. */
function mockFrames(finalRound: number, chunks: Record<string, ArrayBuffer | null>) {
  vi.mocked(simulationsApi.getFrames).mockImplementation((_run, _net, query: FramesQuery) => {
    if ("round" in query) {
      if (query.round === "last") return Promise.resolve(buildSlice(finalRound, 0));
      return Promise.resolve(buildSlice(query.round, 0));
    }
    const key = `${query.from}-${query.to}`;
    if (key in chunks) return Promise.resolve(chunks[key] ?? null);
    return Promise.resolve(buildChunk(range(query.from, query.to)));
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useReplayEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = new Map();
    rafIdCounter = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafIdCounter += 1;
      rafCallbacks.set(rafIdCounter, cb);
      return rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks.delete(id);
    });
    mockGetState.mockReturnValue({
      updateFrame: mockUpdateFrame,
      setFinalRound: mockSetFinalRound,
    });
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
    } as unknown as ReturnType<typeof useTranslation>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderReady(finalRound = 20, agentCount: number | null = AGENT_COUNT) {
    mockFrames(finalRound, {});
    const hook = renderHook(() => useReplayEngine("run-001", "net-001", agentCount));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    // Wait for the chunk-0 prefetch so subsequent renders hit the cache
    const chunkTo = Math.min(999, finalRound);
    await waitFor(() =>
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 0,
        to: chunkTo,
      }),
    );
    return hook;
  }

  describe("init", () => {
    it("stays idle until agentCount is available", () => {
      const { result } = renderHook(() => useReplayEngine("run-001", "net-001", null));

      expect(result.current.status).toBe("idle");
      expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    });

    it("probes round=last, lands ready positioned at the final round without rendering", async () => {
      const { result } = await renderReady(20);

      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        round: "last",
      });
      // Chunk 0 is prefetched for the restart-at-0 that play() triggers
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 0,
        to: 20,
      });
      expect(result.current.finalRound).toBe(20);
      expect(result.current.currentRound).toBe(20);
      expect(mockSetFinalRound).toHaveBeenCalledWith(20);
      // The live view already shows the final state — init must not fight it
      expect(mockUpdateFrame).not.toHaveBeenCalled();
    });

    it("goes unavailable on 404 without fetching chunks", async () => {
      vi.mocked(simulationsApi.getFrames).mockResolvedValue(null);
      const { result } = renderHook(() => useReplayEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(simulationsApi.getFrames).toHaveBeenCalledTimes(1);
      expect(mockUpdateFrame).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("goes error with toast + logger on fetch failure, retry re-runs init", async () => {
      vi.mocked(simulationsApi.getFrames).mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() => useReplayEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(logger.error).toHaveBeenCalledWith("useReplayEngine.init", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("replay.errorLoad");

      mockFrames(20, {});
      act(() => result.current.retry());
      await waitFor(() => expect(result.current.status).toBe("ready"));
    });
  });

  describe("playback", () => {
    it("play from the ready-at-end position restarts at round 0", async () => {
      const { result } = await renderReady(20);
      mockUpdateFrame.mockClear();

      act(() => result.current.play());
      expect(result.current.status).toBe("playing");
      act(() => fireFrames(0));

      expect(result.current.currentRound).toBe(0);
      expect(mockUpdateFrame).toHaveBeenCalledWith(expect.objectContaining({ round: 0 }));
    });

    it("advances at 10 rounds/s at 1x", async () => {
      const { result } = await renderReady(20);
      mockUpdateFrame.mockClear();

      act(() => result.current.play());
      act(() => fireFrames(0, 500));

      expect(result.current.currentRound).toBe(5);
      expect(mockUpdateFrame).toHaveBeenLastCalledWith(expect.objectContaining({ round: 5 }));
    });

    it("advances at 40 rounds/s at 4x", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.setSpeed(4));
      act(() => result.current.play());
      act(() => fireFrames(0, 250));

      expect(result.current.currentRound).toBe(10);
    });

    it("skips intermediate rounds on a large time jump (one render per frame)", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.play());
      act(() => fireFrames(0));
      mockUpdateFrame.mockClear();
      act(() => fireFrames(1000));

      expect(result.current.currentRound).toBe(10);
      expect(mockUpdateFrame).toHaveBeenCalledTimes(1);
    });

    it("pauses automatically at finalRound", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.play());
      act(() => fireFrames(0, 5000));

      expect(result.current.currentRound).toBe(20);
      expect(result.current.status).toBe("paused");
      expect(rafCallbacks.size).toBe(0);
    });

    it("restarts from round 0 when playing from the end", async () => {
      const { result } = await renderReady(20);
      act(() => result.current.play());
      act(() => fireFrames(0, 5000));
      expect(result.current.currentRound).toBe(20);

      act(() => result.current.play());
      act(() => fireFrames(0));

      expect(result.current.status).toBe("playing");
      expect(result.current.currentRound).toBe(0);
    });

    it("pause stops advancement", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.play());
      act(() => fireFrames(0, 500));
      act(() => result.current.pause());
      const roundAtPause = result.current.currentRound;
      act(() => fireFrames(2000));

      expect(result.current.status).toBe("paused");
      expect(result.current.currentRound).toBe(roundAtPause);
    });
  });

  describe("seek", () => {
    it("seeks backward within the cached chunk", async () => {
      const { result } = await renderReady(20);
      act(() => result.current.play());
      act(() => fireFrames(0, 1500));
      expect(result.current.currentRound).toBe(15);
      act(() => result.current.pause());
      mockUpdateFrame.mockClear();

      act(() => result.current.seek(2));

      expect(result.current.currentRound).toBe(2);
      expect(result.current.status).toBe("paused");
      expect(mockUpdateFrame).toHaveBeenCalledWith(expect.objectContaining({ round: 2 }));
    });

    it("fetches the containing chunk on a seek outside the cache", async () => {
      const { result } = await renderReady(1500);
      vi.mocked(simulationsApi.getFrames).mockClear();

      act(() => result.current.seek(1200));

      await waitFor(() => expect(result.current.currentRound).toBe(1200));
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 1000,
        to: 1500,
      });
      expect(result.current.status).toBe("paused");
    });

    it("clamps seeks to [0, finalRound]", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.seek(9999));
      expect(result.current.currentRound).toBe(20);

      act(() => result.current.seek(-5));
      expect(result.current.currentRound).toBe(0);
    });

    it("prefetches the next chunk near the chunk end and dedupes in-flight fetches", async () => {
      const { result } = await renderReady(1500);
      vi.mocked(simulationsApi.getFrames).mockClear();

      let resolveNext: ((buffer: ArrayBuffer) => void) | undefined;
      vi.mocked(simulationsApi.getFrames).mockImplementation((_run, _net, query: FramesQuery) => {
        if ("from" in query && query.from === 1000) {
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        }
        return Promise.resolve(null);
      });

      // Rounds ≥ 750 are within the prefetch window of chunk [0, 999]
      act(() => result.current.seek(800));
      act(() => result.current.seek(810));

      const prefetchCalls = vi
        .mocked(simulationsApi.getFrames)
        .mock.calls.filter(([, , query]) => "from" in query && query.from === 1000);
      expect(prefetchCalls).toHaveLength(1);
      resolveNext?.(buildChunk(range(1000, 1010)));
    });
  });

  describe("robustness", () => {
    it("goes error with toast when a seek fetch fails", async () => {
      const { result } = await renderReady(1500);
      vi.mocked(simulationsApi.getFrames).mockRejectedValue(new Error("network down"));

      act(() => result.current.seek(1200));

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(logger.error).toHaveBeenCalledWith("useReplayEngine.renderRound", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("replay.errorLoad");
    });

    it("pause during seeking cancels the pending seek", async () => {
      const { result } = await renderReady(1500);
      let resolveFetch: ((buffer: ArrayBuffer) => void) | undefined;
      vi.mocked(simulationsApi.getFrames).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );

      act(() => result.current.seek(1200));
      expect(result.current.status).toBe("seeking");
      act(() => result.current.pause());
      expect(result.current.status).toBe("paused");

      resolveFetch?.(buildChunk(range(1000, 1210)));
      await waitFor(() => expect(result.current.status).toBe("paused"));
      // The stale seek result must not render
      expect(result.current.currentRound).toBe(1500);
    });

    it("evicts the oldest chunk beyond the LRU limit and refetches it on demand", async () => {
      const { result } = await renderReady(4500);
      const callsForChunk0 = () =>
        vi
          .mocked(simulationsApi.getFrames)
          .mock.calls.filter(([, , query]) => "from" in query && query.from === 0).length;
      expect(callsForChunk0()).toBe(1);

      // Fill the 4-chunk LRU with chunks 1000..4000 (chunk 0 is the oldest)
      for (const round of [1500, 2500, 3500, 4400]) {
        act(() => result.current.seek(round));
        await waitFor(() => expect(result.current.currentRound).toBe(round));
      }

      // A cached-chunk seek does not refetch
      const callsBefore = vi.mocked(simulationsApi.getFrames).mock.calls.length;
      act(() => result.current.seek(1600));
      await waitFor(() => expect(result.current.currentRound).toBe(1600));
      expect(vi.mocked(simulationsApi.getFrames).mock.calls.length).toBe(callsBefore);

      // Chunk 0 was evicted — seeking back refetches it
      act(() => result.current.seek(500));
      await waitFor(() => expect(result.current.currentRound).toBe(500));
      expect(callsForChunk0()).toBe(2);
    });

    it("suspends playback on an uncached chunk boundary and resumes when it arrives", async () => {
      const { result } = await renderReady(1500);
      let resolveNext: ((buffer: ArrayBuffer) => void) | undefined;
      vi.mocked(simulationsApi.getFrames).mockImplementation((_run, _net, query: FramesQuery) => {
        if ("from" in query && query.from === 1000) {
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        }
        return Promise.resolve(null);
      });

      act(() => result.current.play());
      // Jump the playhead to the end of chunk 0, then across the boundary
      act(() => fireFrames(0, 99_900));
      expect(result.current.currentRound).toBe(999);
      act(() => fireFrames(100_000));

      expect(result.current.status).toBe("seeking");
      resolveNext?.(buildChunk(range(1000, 1100)));
      await waitFor(() => expect(result.current.status).toBe("playing"));
      expect(result.current.currentRound).toBe(1000);
    });

    it("logs prefetch failures without interrupting playback", async () => {
      const { result } = await renderReady(1500);
      vi.mocked(simulationsApi.getFrames).mockRejectedValue(new Error("prefetch boom"));

      // Round 800 is inside cached chunk 0 but within its prefetch window
      act(() => result.current.seek(800));

      await waitFor(() =>
        expect(logger.error).toHaveBeenCalledWith("useReplayEngine.prefetch", expect.any(Error)),
      );
      expect(result.current.currentRound).toBe(800);
      // A cached seek never leaves the current status — still ready, no error
      expect(result.current.status).toBe("ready");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("ignores play and seek before init completes", () => {
      const { result } = renderHook(() => useReplayEngine("run-001", "net-001", null));

      act(() => {
        result.current.play();
        result.current.seek(5);
        result.current.togglePlay();
      });

      expect(result.current.status).toBe("idle");
      expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    });
  });

  describe("teardown", () => {
    it("cancels the driver on unmount", async () => {
      const hook = await renderReady(20);

      act(() => hook.result.current.play());
      act(() => fireFrames(0, 100));
      hook.unmount();

      expect(rafCallbacks.size).toBe(0);
    });
  });
});
