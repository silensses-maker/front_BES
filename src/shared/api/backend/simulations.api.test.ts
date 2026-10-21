import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("./auth-interceptor", () => ({ currentIdToken: vi.fn() }));

vi.mock("./client", () => ({
  backendClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: "/api" },
  },
}));

vi.mock("@/shared/workers/topology-fetch.client", () => ({
  fetchTopologyInWorker: vi.fn(),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

import { fetchTopologyInWorker } from "@/shared/workers/topology-fetch.client";
import { TopologyLoadError } from "@/shared/workers/topology-transfer";
import { currentIdToken } from "./auth-interceptor";
import { backendClient } from "./client";
import { simulationsApi } from "./simulations.api";
import type {
  CustomRunRequest,
  GeneratedRunRequest,
  NetworkListResponse,
  PaginationParams,
  ResultsParams,
  ResultsResponse,
  RunCancelledResponse,
  RunSummary,
  SimCreated,
  SimulationListResponse,
  TopologyParams,
  TopologyResponse,
} from "./types/backend.types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockSimCreated: SimCreated = {
  runId: "run-001",
  status: "running",
  networkCount: 3,
  wsUrl: "ws://localhost:9000/ws",
};

const mockRunSummary: RunSummary = {
  id: "run-001",
  type: "generated",
  name: null,
  status: "completed",
  networkCount: 3,
  iterationLimit: 100,
  stopThreshold: 0.01,
  createdAt: "2026-04-23T10:00:00Z",
};

const mockSimulationListResponse: SimulationListResponse = {
  runs: [mockRunSummary],
  limit: 10,
  offset: 0,
};

const mockRunCancelledResponse: RunCancelledResponse = {
  runId: "run-001",
  cancelled: true,
};

const mockNetworkListResponse: NetworkListResponse = {
  runId: "run-001",
  networks: ["net-001", "net-002"],
};

const mockTopologyResponse: TopologyResponse = {
  runId: "run-001",
  networkId: "net-001",
  agentCount: 5,
  edgeCount: 8,
  agentOffset: 0,
  agentLimit: 100,
  edgeOffset: 0,
  edgeLimit: 100,
  agents: [],
  edges: [],
};

const mockResultsResponse: ResultsResponse = {
  runId: "run-001",
  networkId: "net-001",
  finalRound: 42,
  consensus: true,
  agentCount: 5,
  offset: 0,
  limit: 100,
  agents: [],
};

const mockGeneratedRunRequest: GeneratedRunRequest = {
  numberOfNetworks: 2,
  density: 0.5,
  iterationLimit: 100,
  stopThreshold: 0.01,
  saveMode: 1,
  agentTypes: [{ silenceStrategy: 0, silenceEffect: 0, count: 10 }],
  biasTypes: [],
};

const mockCustomRunRequest: CustomRunRequest = {
  name: "my-network",
  iterationLimit: 50,
  stopThreshold: 0.05,
  saveMode: 0,
  agents: [],
  edges: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("simulationsApi", () => {
  describe("startGenerated", () => {
    it("returns SimCreated when request succeeds", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      const result = await simulationsApi.startGenerated(mockGeneratedRunRequest);

      expect(result).toEqual(mockSimCreated);
      expect(backendClient.post).toHaveBeenCalledWith(
        "/simulations/generated",
        mockGeneratedRunRequest,
      );
    });

    it("exposes the optional effectiveDensity returned for generated runs (#122)", async () => {
      const created: SimCreated = { ...mockSimCreated, effectiveDensity: 2 };
      vi.mocked(backendClient.post).mockResolvedValue({ data: created });

      const result = await simulationsApi.startGenerated(mockGeneratedRunRequest);

      expect(result.effectiveDensity).toBe(2);
    });

    it("propagates error if request fails", async () => {
      const error = new Error("network error");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(simulationsApi.startGenerated(mockGeneratedRunRequest)).rejects.toThrow(
        "network error",
      );
    });
  });

  describe("startCustom", () => {
    it("returns SimCreated when request succeeds", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      const result = await simulationsApi.startCustom(mockCustomRunRequest);

      expect(result).toEqual(mockSimCreated);
      expect(backendClient.post).toHaveBeenCalledWith("/simulations/custom", mockCustomRunRequest);
    });

    it("leaves effectiveDensity undefined for custom runs (the backend omits it)", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      const result = await simulationsApi.startCustom(mockCustomRunRequest);

      expect(result.effectiveDensity).toBeUndefined();
    });

    it("propagates error if request fails", async () => {
      const error = new Error("server error");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(simulationsApi.startCustom(mockCustomRunRequest)).rejects.toThrow(
        "server error",
      );
    });
  });

  describe("startCustomBinary", () => {
    it("returns SimCreated when request succeeds with ArrayBuffer payload", async () => {
      const payload = new ArrayBuffer(8);
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      const result = await simulationsApi.startCustomBinary(payload);

      expect(result).toEqual(mockSimCreated);
      expect(backendClient.post).toHaveBeenCalledWith("/simulations/custom", payload, {
        headers: { "Content-Type": "application/octet-stream" },
      });
    });

    it("sends persistFrames / frameRetention as query params — the binary payload has no such fields (#122)", async () => {
      const payload = new ArrayBuffer(8);
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      await simulationsApi.startCustomBinary(payload, {
        persistFrames: true,
        frameRetention: "ephemeral",
      });

      expect(backendClient.post).toHaveBeenCalledWith("/simulations/custom", payload, {
        headers: { "Content-Type": "application/octet-stream" },
        params: { persistFrames: true, frameRetention: "ephemeral" },
      });
    });

    it("sends no query params when no frame options are given", async () => {
      const payload = new ArrayBuffer(8);
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockSimCreated });

      await simulationsApi.startCustomBinary(payload);

      const config = vi.mocked(backendClient.post).mock.calls[0]?.[2];
      expect(config?.params).toBeUndefined();
    });

    it("propagates error if request fails", async () => {
      const payload = new ArrayBuffer(8);
      const error = new Error("upload failed");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(simulationsApi.startCustomBinary(payload)).rejects.toThrow("upload failed");
    });
  });

  describe("listMine", () => {
    it("returns SimulationListResponse with optional pagination params", async () => {
      const params: PaginationParams = { limit: 5, offset: 0 };
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockSimulationListResponse });

      const result = await simulationsApi.listMine(params);

      expect(result).toEqual(mockSimulationListResponse);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/mine", { params });
    });

    it("returns SimulationListResponse when called without params", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockSimulationListResponse });

      const result = await simulationsApi.listMine();

      expect(result).toEqual(mockSimulationListResponse);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/mine", { params: undefined });
    });

    it("propagates error if request fails", async () => {
      const error = new Error("unauthorized");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.listMine()).rejects.toThrow("unauthorized");
    });
  });

  describe("listAll", () => {
    it("returns SimulationListResponse with optional pagination params", async () => {
      const params: PaginationParams = { limit: 20, offset: 10 };
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockSimulationListResponse });

      const result = await simulationsApi.listAll(params);

      expect(result).toEqual(mockSimulationListResponse);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations", { params });
    });

    it("returns SimulationListResponse when called without params", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockSimulationListResponse });

      const result = await simulationsApi.listAll();

      expect(result).toEqual(mockSimulationListResponse);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations", { params: undefined });
    });

    it("propagates error if request fails", async () => {
      const error = new Error("forbidden");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.listAll()).rejects.toThrow("forbidden");
    });
  });

  describe("getById", () => {
    it("returns RunSummary when run exists", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockRunSummary });

      const result = await simulationsApi.getById("run-001");

      expect(result).toEqual(mockRunSummary);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/run-001");
    });

    it("propagates error if request fails", async () => {
      const error = new Error("not found");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.getById("run-999")).rejects.toThrow("not found");
    });
  });

  describe("getConfig", () => {
    it("GETs the stored configuration of a generated run (#127)", async () => {
      const config = {
        runId: "run-001",
        type: "generated",
        numberOfNetworks: 2,
        agentsPerNetwork: 10,
        effectiveDensity: 2,
        iterationLimit: 100,
        stopThreshold: 0.01,
        seed: "9007199254740991",
        frameRetention: "ephemeral",
        agentTypes: [{ silenceStrategy: 0, silenceEffect: 0, count: 10 }],
        biasTypes: [{ biasType: 0, count: 34 }],
      };
      vi.mocked(backendClient.get).mockResolvedValue({ data: config });

      const result = await simulationsApi.getConfig("run-001");

      expect(result).toEqual(config);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/run-001/config");
    });

    it("propagates the 404 of a custom run", async () => {
      vi.mocked(backendClient.get).mockRejectedValue(new Error("not found"));

      await expect(simulationsApi.getConfig("run-c")).rejects.toThrow("not found");
    });
  });

  describe("polarization (#129)", () => {
    it("GETs the pol_measures catalog", async () => {
      const catalog = {
        measures: [{ id: "MEC" }],
        alienations: [],
        package: { commit: "0e05564" },
      };
      vi.mocked(backendClient.get).mockResolvedValue({ data: catalog });

      await expect(simulationsApi.getPolarizationMeasures()).resolves.toEqual(catalog);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/polarization/measures");
    });

    it("POSTs the measure, its parameters, k and the histograms", async () => {
      const result = { values: [0.5], levels: ["low"], classification: null, unique: 1 };
      vi.mocked(backendClient.post).mockResolvedValue({ data: result });
      const body = { measure: "MEC", params: { alpha: 2 }, k: 3, histograms: [[1, 0, 1]] };

      await expect(simulationsApi.computePolarization(body)).resolves.toEqual(result);
      expect(backendClient.post).toHaveBeenCalledWith("/simulations/polarization", body);
    });

    it("propagates the server's errors (503 worker unavailable, 404 disabled)", async () => {
      vi.mocked(backendClient.post).mockRejectedValue(new Error("unavailable"));
      await expect(
        simulationsApi.computePolarization({ measure: "MEC", k: 3, histograms: [[1, 1, 1]] }),
      ).rejects.toThrow("unavailable");
      vi.mocked(backendClient.get).mockRejectedValue(new Error("not found"));
      await expect(simulationsApi.getPolarizationMeasures()).rejects.toThrow("not found");
    });
  });

  describe("cancel", () => {
    it("returns RunCancelledResponse when successful", async () => {
      vi.mocked(backendClient.delete).mockResolvedValue({ data: mockRunCancelledResponse });

      const result = await simulationsApi.cancel("run-001");

      expect(result).toEqual(mockRunCancelledResponse);
      expect(backendClient.delete).toHaveBeenCalledWith("/simulations/run-001");
    });

    it("propagates error if request fails", async () => {
      const error = new Error("cannot cancel completed run");
      vi.mocked(backendClient.delete).mockRejectedValue(error);

      await expect(simulationsApi.cancel("run-001")).rejects.toThrow("cannot cancel completed run");
    });
  });

  describe("listNetworks", () => {
    it("returns NetworkListResponse for run", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockNetworkListResponse });

      const result = await simulationsApi.listNetworks("run-001");

      expect(result).toEqual(mockNetworkListResponse);
      expect(backendClient.get).toHaveBeenCalledWith("/simulations/run-001/networks");
    });

    it("propagates error if request fails", async () => {
      const error = new Error("run not found");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.listNetworks("run-001")).rejects.toThrow("run not found");
    });
  });

  describe("getTopology", () => {
    it("returns TopologyResponse when status 200", async () => {
      const params: TopologyParams = { agentOffset: 0, agentLimit: 50 };
      vi.mocked(backendClient.get).mockResolvedValue({
        status: 200,
        data: mockTopologyResponse,
      });

      const result = await simulationsApi.getTopology("run-001", "net-001", params);

      expect(result).toEqual(mockTopologyResponse);
      expect(backendClient.get).toHaveBeenCalledWith(
        "/simulations/run-001/networks/net-001/topology",
        expect.objectContaining({ params }),
      );
    });

    it("returns null when status 202 (pending)", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({
        status: 202,
        data: null,
      });

      const result = await simulationsApi.getTopology("run-001", "net-001");

      expect(result).toBeNull();
    });

    it("propagates error on unexpected status", async () => {
      const error = new Error("server error");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.getTopology("run-001", "net-001")).rejects.toThrow(
        "server error",
      );
    });
  });

  describe("getTopologyFull (#128: topology worker)", () => {
    it("downloads in the worker with an absolute base URL, a fresh token and the progress", async () => {
      vi.mocked(fetchTopologyInWorker).mockResolvedValue(mockTopologyResponse);
      const onProgress = vi.fn();

      const result = await simulationsApi.getTopologyFull("run-001", "net-001", { onProgress });

      expect(result).toBe(mockTopologyResponse);
      expect(fetchTopologyInWorker).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: new URL("/api", window.location.href).href,
          runId: "run-001",
          networkId: "net-001",
          getToken: currentIdToken,
          onProgress,
          // bench probes are compiled out of normal builds
          onPage: undefined,
          onResources: undefined,
        }),
      );
    });

    it("resolves null when the topology is not ready (202)", async () => {
      vi.mocked(fetchTopologyInWorker).mockResolvedValue(null);
      await expect(simulationsApi.getTopologyFull("run-001", "net-001")).resolves.toBeNull();
    });

    it("rejects when a page still fails after its retries — never a partial topology", async () => {
      const error = new TopologyLoadError({
        kind: "http",
        status: 503,
        attempts: 4,
        message: "topology page answered 503",
      });
      vi.mocked(fetchTopologyInWorker).mockRejectedValue(error);

      await expect(simulationsApi.getTopologyFull("run-001", "net-001")).rejects.toBe(error);
      expect(backendClient.get).not.toHaveBeenCalled();
    });
  });

  describe("getResults", () => {
    it("returns ResultsResponse when status 200", async () => {
      const params: ResultsParams = { offset: 0, limit: 50 };
      vi.mocked(backendClient.get).mockResolvedValue({
        status: 200,
        data: mockResultsResponse,
      });

      const result = await simulationsApi.getResults("run-001", "net-001", params);

      expect(result).toEqual(mockResultsResponse);
      expect(backendClient.get).toHaveBeenCalledWith(
        "/simulations/run-001/networks/net-001/results",
        expect.objectContaining({ params }),
      );
    });

    it("returns null when status 202 (pending)", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({
        status: 202,
        data: null,
      });

      const result = await simulationsApi.getResults("run-001", "net-001");

      expect(result).toBeNull();
    });

    it("propagates error on unexpected status", async () => {
      const error = new Error("internal error");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.getResults("run-001", "net-001")).rejects.toThrow(
        "internal error",
      );
    });
  });

  describe("getFrames", () => {
    const mockBuffer = new ArrayBuffer(36);

    it("requests an exact round as arraybuffer", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ status: 200, data: mockBuffer });

      const result = await simulationsApi.getFrames("run-001", "net-001", { round: 50 });

      expect(result).toBe(mockBuffer);
      expect(backendClient.get).toHaveBeenCalledWith(
        "/simulations/run-001/networks/net-001/frames",
        expect.objectContaining({
          params: { round: 50 },
          responseType: "arraybuffer",
        }),
      );
    });

    it("requests the last persisted round", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ status: 200, data: mockBuffer });

      await simulationsApi.getFrames("run-001", "net-001", { round: "last" });

      expect(backendClient.get).toHaveBeenCalledWith(
        "/simulations/run-001/networks/net-001/frames",
        expect.objectContaining({ params: { round: "last" } }),
      );
    });

    it("requests an inclusive range", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ status: 200, data: mockBuffer });

      await simulationsApi.getFrames("run-001", "net-001", { from: 0, to: 99 });

      expect(backendClient.get).toHaveBeenCalledWith(
        "/simulations/run-001/networks/net-001/frames",
        expect.objectContaining({ params: { from: 0, to: 99 } }),
      );
    });

    it("returns null when status 404 (frames not persisted or expired)", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ status: 404, data: null });

      const result = await simulationsApi.getFrames("run-001", "net-001", { round: "last" });

      expect(result).toBeNull();
    });

    it("propagates error on unexpected status", async () => {
      const error = new Error("forbidden");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(simulationsApi.getFrames("run-001", "net-001", { round: 1 })).rejects.toThrow(
        "forbidden",
      );
    });
  });
});
