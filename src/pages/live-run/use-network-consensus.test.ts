import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultsResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { useNetworkConsensus } from "./use-network-consensus";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getResults: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const getResultsMock = vi.mocked(simulationsApi.getResults);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RUN_ID = "run-1";

function resultsFor(networkId: string, consensus: boolean, finalRound = 12): ResultsResponse {
  return {
    runId: RUN_ID,
    networkId,
    finalRound,
    consensus,
    agentCount: 10,
    offset: 0,
    limit: 0,
    agents: [],
  };
}

const callsFor = (networkId: string) =>
  getResultsMock.mock.calls.filter((call) => call[1] === networkId).length;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useNetworkConsensus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getResultsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A stable reference, matching how the real caller (LiveRunPage) provides
  // networkIds via useState — an inline array literal would be re-created on
  // every render and is exercised separately below.
  const ONE_NETWORK = ["net-1"];
  const TWO_NETWORKS = ["net-1", "net-2"];

  it("starts every network id as pending", () => {
    getResultsMock.mockResolvedValue(null);
    const { result } = renderHook(() => useNetworkConsensus(RUN_ID, TWO_NETWORKS));

    expect(result.current["net-1"]?.status).toBe("pending");
    expect(result.current["net-2"]?.status).toBe("pending");
  });

  it("keeps polling while the backend returns 202 (null)", async () => {
    getResultsMock.mockResolvedValue(null);
    const { result } = renderHook(() => useNetworkConsensus(RUN_ID, ONE_NETWORK));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(result.current["net-1"]?.status).toBe("pending");
    expect(callsFor("net-1")).toBe(2); // initial poll + one tick
  });

  it("resolves to consensus when the backend returns consensus: true", async () => {
    getResultsMock.mockResolvedValueOnce(resultsFor("net-1", true, 12));
    const { result } = renderHook(() => useNetworkConsensus(RUN_ID, ONE_NETWORK));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current["net-1"]).toEqual({ status: "consensus", finalRound: 12 });
  });

  it("resolves to no-consensus when the backend returns consensus: false", async () => {
    getResultsMock.mockResolvedValueOnce(resultsFor("net-1", false, 30));
    const { result } = renderHook(() => useNetworkConsensus(RUN_ID, ONE_NETWORK));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current["net-1"]).toEqual({ status: "no-consensus", finalRound: 30 });
  });

  it("stops polling a network id once it has resolved, keeps polling the rest", async () => {
    getResultsMock.mockImplementation(async (_runId, networkId) =>
      networkId === "net-1" ? resultsFor("net-1", true) : null,
    );

    renderHook(() => useNetworkConsensus(RUN_ID, TWO_NETWORKS));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(callsFor("net-1")).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000); // two more ticks
    });

    expect(callsFor("net-1")).toBe(1); // resolved — no further calls
    expect(callsFor("net-2")).toBe(3); // still pending — kept polling
  });

  it("clears the interval on unmount", async () => {
    getResultsMock.mockResolvedValue(null);
    const { unmount } = renderHook(() => useNetworkConsensus(RUN_ID, ONE_NETWORK));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsBeforeUnmount = getResultsMock.mock.calls.length;

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(getResultsMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
