import { beforeEach, describe, expect, it } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import type { SimulationState } from "../types/simulation.types";
import { useSimulationStore } from "./simulation.store";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockTopology: TopologyResponse = {
  runId: "run-abc-123",
  networkId: "net-abc-123",
  agentCount: 3,
  edgeCount: 2,
  agentOffset: 0,
  agentLimit: 10,
  edgeOffset: 0,
  edgeLimit: 10,
  agents: [],
  edges: [],
};

const mockFrame: MergedFrame = {
  runId: "72057594037927936",
  networkId: "01020304-0506-0708-090a-0b0c0d0e0f10",
  round: 5,
  publicBelief: new Float32Array([0.4, 0.7]),
  privateBelief: new Float32Array([0.6, 0.3]),
  speaking: new Uint8Array([1, 0]),
};

const initialState: SimulationState = {
  status: "idle",
  runId: null,
  networkId: null,
  topology: null,
  currentRound: 0,
  latestFrame: null,
  receivedFrame: null,
  receivedRound: 0,
  follow: true,
  finalRound: null,
  consensus: null,
  error: null,
  selectedAgentIndex: null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationStore", () => {
  beforeEach(() => {
    useSimulationStore.setState(initialState);
  });

  describe("initial state", () => {
    it("has status idle", () => {
      expect(useSimulationStore.getState().status).toBe("idle");
    });

    it("has runId null", () => {
      expect(useSimulationStore.getState().runId).toBeNull();
    });

    it("has topology null", () => {
      expect(useSimulationStore.getState().topology).toBeNull();
    });

    it("has currentRound zero", () => {
      expect(useSimulationStore.getState().currentRound).toBe(0);
    });

    it("has error null", () => {
      expect(useSimulationStore.getState().error).toBeNull();
    });
  });

  describe("setRunId", () => {
    it("updates runId to the provided value", () => {
      useSimulationStore.getState().setRunId("run-xyz-999");
      expect(useSimulationStore.getState().runId).toBe("run-xyz-999");
    });
  });

  describe("setStatus", () => {
    it("updates status to the provided SimulationStatus value", () => {
      useSimulationStore.getState().setStatus("running");
      expect(useSimulationStore.getState().status).toBe("running");
    });

    it("updates status to cancelled", () => {
      useSimulationStore.getState().setStatus("cancelled");
      expect(useSimulationStore.getState().status).toBe("cancelled");
    });
  });

  describe("setNetworkId", () => {
    it("updates networkId to the provided value", () => {
      useSimulationStore.getState().setNetworkId("net-xyz-999");
      expect(useSimulationStore.getState().networkId).toBe("net-xyz-999");
    });
  });

  describe("setTopology", () => {
    it("updates topology to the provided TopologyResponse object", () => {
      useSimulationStore.getState().setTopology(mockTopology);
      expect(useSimulationStore.getState().topology).toEqual(mockTopology);
    });
  });

  describe("updateFrame", () => {
    it("updates currentRound from the provided partition", () => {
      useSimulationStore.getState().updateFrame(mockFrame);
      expect(useSimulationStore.getState().currentRound).toBe(mockFrame.round);
    });

    it("does not touch the received cursor (viewed round only)", () => {
      useSimulationStore.getState().updateFrame(mockFrame);
      expect(useSimulationStore.getState().receivedRound).toBe(0);
      expect(useSimulationStore.getState().receivedFrame).toBeNull();
    });
  });

  describe("ingestLiveFrame", () => {
    it("always advances receivedFrame and receivedRound", () => {
      useSimulationStore.getState().ingestLiveFrame(mockFrame);
      expect(useSimulationStore.getState().receivedFrame).toBe(mockFrame);
      expect(useSimulationStore.getState().receivedRound).toBe(mockFrame.round);
    });

    it("renders the frame when follow is on", () => {
      useSimulationStore.getState().ingestLiveFrame(mockFrame);
      expect(useSimulationStore.getState().latestFrame).toBe(mockFrame);
      expect(useSimulationStore.getState().currentRound).toBe(mockFrame.round);
    });

    it("does NOT render the frame when detached (follow off)", () => {
      useSimulationStore.getState().setFollow(false);
      useSimulationStore.setState({ currentRound: 2 });
      useSimulationStore.getState().ingestLiveFrame(mockFrame);
      expect(useSimulationStore.getState().latestFrame).toBeNull();
      expect(useSimulationStore.getState().currentRound).toBe(2);
      expect(useSimulationStore.getState().receivedRound).toBe(mockFrame.round);
    });

    it("never regresses receivedRound on an out-of-order frame", () => {
      useSimulationStore.getState().ingestLiveFrame(mockFrame);
      useSimulationStore.getState().ingestLiveFrame({ ...mockFrame, round: 3 });
      expect(useSimulationStore.getState().receivedRound).toBe(mockFrame.round);
    });
  });

  describe("setConsensus", () => {
    it("stores the verdict", () => {
      useSimulationStore.getState().setConsensus(true);
      expect(useSimulationStore.getState().consensus).toBe(true);
    });
  });

  describe("setFinalRound", () => {
    it("updates finalRound to the provided value", () => {
      useSimulationStore.getState().setFinalRound(10);
      expect(useSimulationStore.getState().finalRound).toBe(10);
    });
  });

  describe("setError", () => {
    it("sets status to error", () => {
      useSimulationStore.getState().setError("Connection lost");
      expect(useSimulationStore.getState().status).toBe("error");
    });

    it("sets error to the provided message", () => {
      useSimulationStore.getState().setError("Connection lost");
      expect(useSimulationStore.getState().error).toBe("Connection lost");
    });
  });

  describe("setSelectedAgentIndex", () => {
    it("updates selectedAgentIndex to the provided number", () => {
      useSimulationStore.getState().setSelectedAgentIndex(2);
      expect(useSimulationStore.getState().selectedAgentIndex).toBe(2);
    });

    it("updates selectedAgentIndex to null", () => {
      useSimulationStore.setState({ selectedAgentIndex: 2 });
      useSimulationStore.getState().setSelectedAgentIndex(null);
      expect(useSimulationStore.getState().selectedAgentIndex).toBeNull();
    });
  });

  describe("reset", () => {
    it("restores status to idle", () => {
      useSimulationStore.setState({ status: "running" });
      useSimulationStore.getState().reset();
      expect(useSimulationStore.getState().status).toBe("idle");
    });

    it("restores runId to null", () => {
      useSimulationStore.setState({ runId: "run-xyz-999" });
      useSimulationStore.getState().reset();
      expect(useSimulationStore.getState().runId).toBeNull();
    });

    it("restores topology to null", () => {
      useSimulationStore.setState({ topology: mockTopology });
      useSimulationStore.getState().reset();
      expect(useSimulationStore.getState().topology).toBeNull();
    });

    it("restores currentRound to zero", () => {
      useSimulationStore.setState({ currentRound: 42 });
      useSimulationStore.getState().reset();
      expect(useSimulationStore.getState().currentRound).toBe(0);
    });

    it("restores error to null", () => {
      useSimulationStore.setState({ error: "some error" });
      useSimulationStore.getState().reset();
      expect(useSimulationStore.getState().error).toBeNull();
    });

    it("restores the live cursor and verdict", () => {
      useSimulationStore.setState({
        receivedFrame: mockFrame,
        receivedRound: 9,
        follow: false,
        consensus: true,
      });
      useSimulationStore.getState().reset();
      const state = useSimulationStore.getState();
      expect(state.receivedFrame).toBeNull();
      expect(state.receivedRound).toBe(0);
      expect(state.follow).toBe(true);
      expect(state.consensus).toBeNull();
    });
  });
});
