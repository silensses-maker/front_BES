import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("./auth-interceptor", () => ({}));

vi.mock("./client", () => ({
  backendClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

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
  WsTicketResponse,
} from "./types/backend.types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockSimCreated: SimCreated = {
  runId: "run-001",
  status: "running",
  networkCount: 3,
  channelId: "chan-001",
  wsTicket: "ticket-abc",
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

const mockWsTicketResponse: WsTicketResponse = {
  wsTicket: "ticket-xyz",
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

  describe("getWsTicket", () => {
    it("returns WsTicketResponse when request succeeds", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockWsTicketResponse });

      const result = await simulationsApi.getWsTicket("run-001");

      expect(result).toEqual(mockWsTicketResponse);
      expect(backendClient.post).toHaveBeenCalledWith("/simulations/run-001/ws-ticket");
    });

    it("propagates error if request fails", async () => {
      const error = new Error("ticket generation failed");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(simulationsApi.getWsTicket("run-001")).rejects.toThrow(
        "ticket generation failed",
      );
    });
  });
});
