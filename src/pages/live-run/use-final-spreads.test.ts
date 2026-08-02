import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import { useFinalSpreads } from "./use-final-spreads";

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getResults: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

function resultsWith(beliefs: number[]) {
  return {
    runId: "run-1",
    networkId: "n",
    finalRound: 10,
    consensus: true,
    agentCount: beliefs.length,
    offset: 0,
    limit: 100_000,
    agents: beliefs.map((finalBelief, index) => ({
      index,
      name: null,
      finalBelief,
      publicBelief: finalBelief,
    })),
  };
}

describe("useFinalSpreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches missing networks once and caches the spread", async () => {
    vi.mocked(simulationsApi.getResults).mockResolvedValue(resultsWith([0.2, 0.9]));
    const { result } = renderHook(() => useFinalSpreads("run-1"));

    act(() => result.current.requestSpreads(["n1"]));
    await waitFor(() => expect(result.current.finalSpreads.n1).toBeCloseTo(0.7, 5));

    act(() => result.current.requestSpreads(["n1"]));
    expect(simulationsApi.getResults).toHaveBeenCalledTimes(1);
  });

  it("dedupes in-flight requests for the same id", async () => {
    let resolveFetch: ((v: ReturnType<typeof resultsWith>) => void) | undefined;
    vi.mocked(simulationsApi.getResults).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useFinalSpreads("run-1"));

    act(() => {
      result.current.requestSpreads(["n1"]);
      result.current.requestSpreads(["n1"]);
    });
    expect(simulationsApi.getResults).toHaveBeenCalledTimes(1);

    resolveFetch?.(resultsWith([0.1, 0.4]));
    await waitFor(() => expect(result.current.finalSpreads.n1).toBeCloseTo(0.3, 5));
  });

  it("does not cache 202-pending results (retry allowed later)", async () => {
    vi.mocked(simulationsApi.getResults).mockResolvedValue(null);
    const { result } = renderHook(() => useFinalSpreads("run-1"));

    act(() => result.current.requestSpreads(["n1"]));
    await waitFor(() => expect(simulationsApi.getResults).toHaveBeenCalledTimes(1));
    expect(result.current.finalSpreads.n1).toBeUndefined();

    vi.mocked(simulationsApi.getResults).mockResolvedValue(resultsWith([0, 1]));
    act(() => result.current.requestSpreads(["n1"]));
    await waitFor(() => expect(result.current.finalSpreads.n1).toBeCloseTo(1, 5));
  });

  it("tolerates fetch errors without caching", async () => {
    vi.mocked(simulationsApi.getResults).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useFinalSpreads("run-1"));

    act(() => result.current.requestSpreads(["n1", "n2"]));
    await waitFor(() => expect(simulationsApi.getResults).toHaveBeenCalledTimes(2));
    expect(result.current.finalSpreads).toEqual({});
  });
});
