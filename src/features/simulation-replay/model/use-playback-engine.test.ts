import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { autoSpeed, usePlaybackEngine } from "./use-playback-engine";

// ─── Module mocks ────────────────────────────────────────────────────────────
// The engine reads the REAL simulation store (selectors + getState); mocking
// only the store file keeps the entity index (and its Firebase-touching ws
// module) out of the test graph.

vi.mock("@/entities/simulation", async () => ({
  useSimulationStore: (
    await vi.importActual<typeof import("../../../entities/simulation/model/simulation.store")>(
      "../../../entities/simulation/model/simulation.store",
    )
  ).useSimulationStore,
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
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { useSimulationStore } from "@/entities/simulation";

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

function makeFrame(round: number): MergedFrame {
  return {
    runId: "run-001",
    networkId: "net-001",
    round,
    publicBelief: new Float32Array(AGENT_COUNT),
    privateBelief: new Float32Array(AGENT_COUNT),
    speaking: new Uint8Array(AGENT_COUNT),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("autoSpeed", () => {
  it("maps run length to the mockup's power-of-two heuristic", () => {
    expect(autoSpeed(20)).toBe(1);
    expect(autoSpeed(1000)).toBe(4);
    expect(autoSpeed(10_000)).toBe(64);
  });
});

describe("usePlaybackEngine", () => {
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
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
    } as unknown as ReturnType<typeof useTranslation>);
    useSimulationStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderReady(finalRound = 20, agentCount: number | null = AGENT_COUNT) {
    useSimulationStore.setState({ status: "completed" });
    mockFrames(finalRound, {});
    const hook = renderHook(() => usePlaybackEngine("run-001", "net-001", agentCount));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    const chunkTo = Math.min(999, finalRound);
    await waitFor(() =>
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 0,
        to: chunkTo,
      }),
    );
    return hook;
  }

  describe("cold-loaded finished run (#89 semantics)", () => {
    it("stays idle until agentCount is available", () => {
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", null));

      expect(result.current.status).toBe("idle");
      expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    });

    it("probes round=last, lands ready at the final round with auto speed", async () => {
      const { result } = await renderReady(1000);

      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        round: "last",
      });
      expect(result.current.finalRound).toBe(1000);
      expect(useSimulationStore.getState().finalRound).toBe(1000);
      // No frame pushed at init — the live view already shows the final state
      expect(useSimulationStore.getState().latestFrame).toBeNull();
      // autoSpeed(1000) = ×4
      expect(result.current.speed).toBe(4);
    });

    it("goes unavailable on 404 without fetching chunks", async () => {
      useSimulationStore.setState({ status: "completed" });
      vi.mocked(simulationsApi.getFrames).mockResolvedValue(null);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(simulationsApi.getFrames).toHaveBeenCalledTimes(1);
    });

    it("goes error with toast on fetch failure, retry re-runs init", async () => {
      useSimulationStore.setState({ status: "completed" });
      vi.mocked(simulationsApi.getFrames).mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(logger.error).toHaveBeenCalledWith("usePlaybackEngine.init", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("replay.errorLoad");

      mockFrames(20, {});
      act(() => result.current.retry());
      await waitFor(() => expect(result.current.status).toBe("ready"));
    });

    it("play from the ready-at-end position restarts at round 0 and advances at speed", async () => {
      const { result } = await renderReady(20);
      act(() => result.current.setSpeed(1));

      act(() => result.current.play());
      expect(result.current.status).toBe("playing");
      act(() => fireFrames(0, 500));

      // 10 rounds/s at ×1 → round 5 after 500ms
      expect(result.current.currentRound).toBe(5);
    });

    it("advances at 640 rounds/s at ×64", async () => {
      const { result } = await renderReady(2000);
      act(() => result.current.setSpeed(64));

      act(() => result.current.play());
      act(() => fireFrames(0, 1000));

      await waitFor(() => expect(result.current.currentRound).toBe(640));
    });

    it("pauses automatically at finalRound", async () => {
      const { result } = await renderReady(20);
      act(() => result.current.setSpeed(1));

      act(() => result.current.play());
      act(() => fireFrames(0, 5000));

      expect(result.current.currentRound).toBe(20);
      expect(result.current.status).toBe("paused");
      expect(rafCallbacks.size).toBe(0);
    });

    it("clamps seeks to [0, finalRound]", async () => {
      const { result } = await renderReady(20);

      act(() => result.current.seek(9999));
      expect(result.current.currentRound).toBe(20);

      act(() => result.current.seek(-5));
      expect(result.current.currentRound).toBe(0);
    });

    it("stepBy moves relative to the viewed round", async () => {
      const { result } = await renderReady(20);
      act(() => result.current.seek(10));
      expect(result.current.currentRound).toBe(10);

      act(() => result.current.stepBy(-3));
      expect(result.current.currentRound).toBe(7);
      act(() => result.current.stepBy(10));
      act(() => result.current.stepBy(10));
      expect(result.current.currentRound).toBe(20);
    });
  });

  describe("warm finished run (frames received this session)", () => {
    it("finalizes from the store without probing", async () => {
      useSimulationStore.setState({
        status: "completed",
        receivedRound: 40,
        currentRound: 40,
        finalRound: 40,
      });
      mockFrames(40, {});
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("paused"));
      expect(result.current.finalRound).toBe(40);
      const probeCalls = vi
        .mocked(simulationsApi.getFrames)
        .mock.calls.filter(([, , query]) => "round" in query);
      expect(probeCalls).toHaveLength(0);
    });

    it("derives finalRound from receivedRound when the store has none (cancelled run)", async () => {
      useSimulationStore.setState({ status: "cancelled", receivedRound: 17, currentRound: 17 });
      mockFrames(17, {});
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      await waitFor(() => expect(result.current.status).toBe("paused"));
      expect(result.current.finalRound).toBe(17);
      expect(useSimulationStore.getState().finalRound).toBe(17);
    });
  });

  describe("live run", () => {
    function setupLive(receivedRound: number) {
      useSimulationStore.setState({
        status: "running",
        receivedRound,
        currentRound: receivedRound,
        receivedFrame: makeFrame(receivedRound),
        follow: true,
      });
      mockFrames(receivedRound, {});
    }

    it("stays passive in live-follow mode (no fetches)", () => {
      setupLive(10);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      expect(result.current.status).toBe("live");
      expect(result.current.isLive).toBe(true);
      expect(result.current.follow).toBe(true);
      expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    });

    it("seek detaches from the tail and renders from a chunk clamped to recibidas", async () => {
      setupLive(5);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      act(() => result.current.seek(3));

      await waitFor(() => expect(result.current.currentRound).toBe(3));
      expect(result.current.follow).toBe(false);
      expect(useSimulationStore.getState().follow).toBe(false);
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 0,
        to: 5,
      });
      expect(result.current.status).toBe("paused");
    });

    it("clamps live seeks to receivedRound", async () => {
      setupLive(5);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      act(() => result.current.seek(500));

      await waitFor(() => expect(result.current.currentRound).toBe(5));
    });

    it("invalidates a partial live chunk once newer rounds are needed", async () => {
      setupLive(5);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      act(() => result.current.seek(3));
      await waitFor(() => expect(result.current.currentRound).toBe(3));

      // More rounds arrive; the cached [0..5] chunk cannot serve round 20
      act(() => useSimulationStore.setState({ receivedRound: 25 }));
      act(() => result.current.seek(20));

      await waitFor(() => expect(result.current.currentRound).toBe(20));
      expect(simulationsApi.getFrames).toHaveBeenCalledWith("run-001", "net-001", {
        from: 0,
        to: 25,
      });
    });

    it("returnToLive re-attaches and renders the latest received frame", async () => {
      setupLive(5);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));
      act(() => result.current.seek(3));
      await waitFor(() => expect(result.current.currentRound).toBe(3));

      act(() => result.current.returnToLive());

      expect(result.current.status).toBe("live");
      expect(useSimulationStore.getState().follow).toBe(true);
      expect(result.current.currentRound).toBe(5);
    });

    it("play while following restarts at round 0 over the received prefix", async () => {
      setupLive(5);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));
      act(() => result.current.setSpeed(1));

      act(() => result.current.play());
      expect(useSimulationStore.getState().follow).toBe(false);
      // First tick misses the cache → async chunk fetch renders round 0
      act(() => fireFrames(0));
      await waitFor(() => expect(result.current.currentRound).toBe(0));
      await waitFor(() => expect(result.current.status).toBe("playing"));

      act(() => fireFrames(1000, 1500));
      await waitFor(() => expect(result.current.currentRound).toBe(5));
    });

    it("blocks live scrubbing when the frames endpoint 404s mid-run", async () => {
      setupLive(5);
      vi.mocked(simulationsApi.getFrames).mockResolvedValue(null);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));

      act(() => result.current.seek(3));

      await waitFor(() => expect(result.current.liveScrubBlocked).toBe(true));
      expect(toast.warning).toHaveBeenCalledWith("runView.liveScrubUnavailableToast");
      expect(result.current.status).toBe("live");
      expect(useSimulationStore.getState().follow).toBe(true);

      // Further seeks are ignored while blocked
      vi.mocked(simulationsApi.getFrames).mockClear();
      act(() => result.current.seek(3));
      expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    });

    it("finalizes in place when the run completes while mounted", async () => {
      setupLive(4);
      const { result } = renderHook(() => usePlaybackEngine("run-001", "net-001", AGENT_COUNT));
      expect(result.current.status).toBe("live");

      act(() => {
        useSimulationStore.setState({ status: "completed", finalRound: 4 });
      });

      await waitFor(() => expect(result.current.status).toBe("paused"));
      expect(result.current.finalRound).toBe(4);
      expect(result.current.isLive).toBe(false);
      // No probe — frames were received in this session
      const probeCalls = vi
        .mocked(simulationsApi.getFrames)
        .mock.calls.filter(([, , query]) => "round" in query);
      expect(probeCalls).toHaveLength(0);
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
