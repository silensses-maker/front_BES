import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import { startAggregatesSweep } from "./aggregates-sweep";

// Real aggregates store; entity index (Firebase-touching ws module) stays out.
vi.mock("@/entities/simulation", async () => ({
  useRoundAggregatesStore: (
    await vi.importActual<
      typeof import("../../../entities/simulation/model/round-aggregates.store")
    >("../../../entities/simulation/model/round-aggregates.store")
  ).useRoundAggregatesStore,
}));

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getFrames: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { useRoundAggregatesStore } from "@/entities/simulation";

const AGENT_COUNT = 4;
const KEY = "run-001|net-001";

function buildSlice(round: number): ArrayBuffer {
  const buffer = new ArrayBuffer(36 + AGENT_COUNT * 9);
  const view = new DataView(buffer);
  view.setInt32(24, AGENT_COUNT, true);
  view.setInt32(28, round, true);
  view.setInt32(32, 0, true);
  for (let i = 0; i < AGENT_COUNT; i++) {
    view.setFloat32(36 + i * 8, 0.5, true);
    view.setFloat32(36 + i * 8 + 4, 0.5, true);
    view.setUint8(36 + AGENT_COUNT * 8 + i, 1);
  }
  return buffer;
}

function buildChunk(from: number, to: number): ArrayBuffer {
  const slices = [];
  for (let r = from; r <= to; r++) slices.push(buildSlice(r));
  const total = slices.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const s of slices) {
    out.set(new Uint8Array(s), offset);
    offset += s.byteLength;
  }
  return out.buffer;
}

describe("startAggregatesSweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRoundAggregatesStore.getState().reset();
    vi.mocked(simulationsApi.getFrames).mockImplementation((_r, _n, query) => {
      if ("from" in query) return Promise.resolve(buildChunk(query.from, query.to));
      return Promise.resolve(null);
    });
  });

  it("fills every round and marks sweepDone", async () => {
    const handle = startAggregatesSweep({
      runId: "run-001",
      networkId: "net-001",
      agentCount: AGENT_COUNT,
      finalRound: 12,
    });
    await handle.done;

    const state = useRoundAggregatesStore.getState();
    expect(state.sweepDone).toBe(true);
    expect(state.maxRound).toBe(12);
    for (let r = 0; r <= 12; r++) {
      expect(state.aggregates[r]).toBeDefined();
    }
    expect(state.aggregates[5]?.participation).toBe(1);
  });

  it("skips fetching chunks whose rounds are already ingested", async () => {
    // Pre-ingest everything (as if the run was watched live end-to-end)
    for (let r = 0; r <= 12; r++) {
      useRoundAggregatesStore.getState().ingest(KEY, {
        runId: "run-001",
        networkId: "net-001",
        round: r,
        publicBelief: new Float32Array(AGENT_COUNT),
        privateBelief: new Float32Array(AGENT_COUNT),
        speaking: new Uint8Array(AGENT_COUNT),
      });
    }

    const handle = startAggregatesSweep({
      runId: "run-001",
      networkId: "net-001",
      agentCount: AGENT_COUNT,
      finalRound: 12,
    });
    await handle.done;

    expect(simulationsApi.getFrames).not.toHaveBeenCalled();
    expect(useRoundAggregatesStore.getState().sweepDone).toBe(true);
  });

  it("stops without sweepDone when frames expire mid-sweep (404)", async () => {
    vi.mocked(simulationsApi.getFrames).mockResolvedValue(null);
    const handle = startAggregatesSweep({
      runId: "run-001",
      networkId: "net-001",
      agentCount: AGENT_COUNT,
      finalRound: 12,
    });
    await handle.done;

    expect(useRoundAggregatesStore.getState().sweepDone).toBe(false);
  });

  it("cancel stops ingestion and never marks sweepDone", async () => {
    let resolveFetch: ((buffer: ArrayBuffer) => void) | undefined;
    vi.mocked(simulationsApi.getFrames).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const handle = startAggregatesSweep({
      runId: "run-001",
      networkId: "net-001",
      agentCount: AGENT_COUNT,
      finalRound: 12,
    });

    handle.cancel();
    resolveFetch?.(buildChunk(0, 12));
    await handle.done;

    const state = useRoundAggregatesStore.getState();
    expect(state.maxRound).toBe(-1);
    expect(state.sweepDone).toBe(false);
  });

  it("swallows and logs fetch errors", async () => {
    vi.mocked(simulationsApi.getFrames).mockRejectedValue(new Error("network"));
    const handle = startAggregatesSweep({
      runId: "run-001",
      networkId: "net-001",
      agentCount: AGENT_COUNT,
      finalRound: 12,
    });

    await expect(handle.done).resolves.toBeUndefined();
    expect(useRoundAggregatesStore.getState().sweepDone).toBe(false);
  });
});
