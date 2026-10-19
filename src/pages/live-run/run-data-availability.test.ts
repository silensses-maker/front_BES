import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import type { RunSummary, TopologyResponse } from "@/shared/api/backend/types/backend.types";
import { logger } from "@/shared/lib/logger";
import { isFinishedRunTopologyGone } from "./run-data-availability";

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getById: vi.fn(), getTopology: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const runWith = (status: RunSummary["status"]): RunSummary => ({
  id: "run-1",
  type: "generated",
  name: null,
  status,
  networkCount: 1,
  iterationLimit: 100,
  stopThreshold: 0.01,
  createdAt: "2026-01-01T00:00:00Z",
});

const emptyPage = {
  runId: "run-1",
  networkId: "net-1",
  agentCount: 3,
  edgeCount: 2,
  agentOffset: 0,
  agentLimit: 0,
  edgeOffset: 0,
  edgeLimit: 0,
  agents: [],
  edges: [],
} as unknown as TopologyResponse;

describe("isFinishedRunTopologyGone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is false for a running run without probing the topology", async () => {
    vi.mocked(simulationsApi.getById).mockResolvedValue(runWith("running"));

    await expect(isFinishedRunTopologyGone("run-1", "net-1")).resolves.toBe(false);
    expect(simulationsApi.getTopology).not.toHaveBeenCalled();
  });

  it.each([
    "completed",
    "cancelled",
    "error",
  ] as const)("is true for a %s run whose topology answers 202 (null)", async (status) => {
    vi.mocked(simulationsApi.getById).mockResolvedValue(runWith(status));
    vi.mocked(simulationsApi.getTopology).mockResolvedValue(null);

    await expect(isFinishedRunTopologyGone("run-1", "net-1")).resolves.toBe(true);
    expect(simulationsApi.getTopology).toHaveBeenCalledWith("run-1", "net-1", {
      agentOffset: 0,
      agentLimit: 0,
      edgeOffset: 0,
      edgeLimit: 0,
    });
  });

  it("is false for a finished run whose topology is still retained", async () => {
    vi.mocked(simulationsApi.getById).mockResolvedValue(runWith("completed"));
    vi.mocked(simulationsApi.getTopology).mockResolvedValue(emptyPage);

    await expect(isFinishedRunTopologyGone("run-1", "net-1")).resolves.toBe(false);
  });

  it("is false (and logs) when a request fails", async () => {
    const error = new Error("network down");
    vi.mocked(simulationsApi.getById).mockRejectedValue(error);

    await expect(isFinishedRunTopologyGone("run-1", "net-1")).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith("isFinishedRunTopologyGone", error);
  });
});
