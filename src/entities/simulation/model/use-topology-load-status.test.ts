import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import type { TopologyLoadProgress } from "@/shared/workers/topology-transfer";
import { loadTopology, resetTopologyLoader } from "../api/topology-loader";
import { useTopologyLoadStatus } from "./use-topology-load-status";

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getTopologyFull: vi.fn() },
}));

let progress: (p: TopologyLoadProgress) => void = () => {};
let finish: (topology: TopologyResponse | null) => void = () => {};
let fail: (error: unknown) => void = () => {};

beforeEach(() => {
  resetTopologyLoader();
  vi.mocked(simulationsApi.getTopologyFull).mockImplementation(
    (_runId, _networkId, options) =>
      new Promise((resolve, reject) => {
        progress = options?.onProgress ?? (() => {});
        finish = resolve;
        fail = reject;
      }),
  );
});

describe("useTopologyLoadStatus", () => {
  it("follows the download of the network: progress, then ready", async () => {
    const { result } = renderHook(() => useTopologyLoadStatus("run-1", "net-1"));
    expect(result.current).toEqual({ phase: "idle" });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = loadTopology("run-1", "net-1");
    });
    expect(result.current).toEqual({ phase: "loading", progress: null });

    act(() => progress({ stage: "download", pagesDone: 3, pagesTotal: 15 }));
    expect(result.current).toEqual({
      phase: "loading",
      progress: { stage: "download", pagesDone: 3, pagesTotal: 15 },
    });

    await act(async () => {
      finish({ runId: "run-1", networkId: "net-1" } as TopologyResponse);
      await pending;
    });
    expect(result.current).toEqual({ phase: "ready" });
  });

  it("shows a failed download until the next one starts", async () => {
    const { result } = renderHook(() => useTopologyLoadStatus("run-1", "net-1"));
    await act(async () => {
      const pending = loadTopology("run-1", "net-1");
      fail(new Error("offline"));
      await pending.catch(() => {});
    });
    expect(result.current.phase).toBe("failed");

    act(() => {
      void loadTopology("run-1", "net-1");
    });
    expect(result.current).toEqual({ phase: "loading", progress: null });
  });

  it("is idle without a network (waiting for the first topology)", () => {
    const { result } = renderHook(() => useTopologyLoadStatus("run-1", null));
    expect(result.current).toEqual({ phase: "idle" });
  });
});
