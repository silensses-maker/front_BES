import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import type { SimulationWsManager } from "@/shared/lib/ws-manager";
import { useSimulationStore } from "../model/simulation.store";
import { createSimulationWsClient } from "./simulation.ws";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    getTopologyFull: vi.fn(),
  },
}));

vi.mock("../model/simulation.store", () => ({
  useSimulationStore: {
    getState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockStoreActions = {
  setRunId: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  setTopology: ReturnType<typeof vi.fn>;
  updateFrame: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  topology: unknown;
};

type MockWorker = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RUN_ID = "run-abc-123";

const MOCK_TOPOLOGY = {
  runId: RUN_ID,
  networkId: "net-1",
  agentCount: 2,
  edgeCount: 1,
  agentOffset: 0,
  agentLimit: 100,
  edgeOffset: 0,
  edgeLimit: 100,
  agents: [],
  edges: [],
};

/**
 * Builds a valid binary frame buffer the client will recognise.
 * The client discriminates frame vs topology binaries by the total-size
 * identity `byteLength === 36 + 9 × numberOfAgents` (numberOfAgents is an int32
 * at offset 24). A bare ArrayBuffer fails that check and gets dropped.
 */
function makeFrameBuffer(numberOfAgents: number): ArrayBuffer {
  const buffer = new ArrayBuffer(36 + 9 * numberOfAgents);
  new DataView(buffer).setInt32(24, numberOfAgents, true);
  return buffer;
}

function makeMockManager() {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as SimulationWsManager;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createSimulationWsClient", () => {
  let mockStore: MockStoreActions;
  let mockWorker: MockWorker;
  let mockManager: SimulationWsManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
      setRunId: vi.fn(),
      setStatus: vi.fn(),
      setTopology: vi.fn(),
      updateFrame: vi.fn(),
      setError: vi.fn(),
      topology: null,
    };

    vi.mocked(useSimulationStore.getState).mockReturnValue(
      mockStore as unknown as ReturnType<typeof useSimulationStore.getState>,
    );

    mockWorker = {
      onmessage: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };

    const capturedWorker = mockWorker;
    vi.stubGlobal(
      "Worker",
      class MockWorkerConstructor {
        postMessage = capturedWorker.postMessage;
        terminate = capturedWorker.terminate;
        constructor() {
          Object.defineProperty(this, "onmessage", {
            get: () => capturedWorker.onmessage,
            set: (v: ((event: MessageEvent) => void) | null) => {
              capturedWorker.onmessage = v;
            },
            enumerable: true,
            configurable: true,
          });
        }
      },
    );

    mockManager = makeMockManager();
  });

  it("returns an object with connect, disconnect, and replayBuffer", () => {
    const client = createSimulationWsClient(RUN_ID, null, mockManager);
    expect(typeof client.connect).toBe("function");
    expect(typeof client.disconnect).toBe("function");
    expect(typeof client.replayBuffer).toBe("function");
  });

  describe("connect()", () => {
    it("sets runId and status to connecting", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      expect(mockStore.setRunId).toHaveBeenCalledWith(RUN_ID);
      expect(mockStore.setStatus).toHaveBeenCalledWith("connecting");
    });

    it("creates a Worker and wires up onmessage", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      expect(mockWorker.onmessage).toBeTypeOf("function");
    });

    it("calls manager.subscribe with runId and two callbacks", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      expect(mockManager.subscribe).toHaveBeenCalledWith(
        RUN_ID,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it("worker onmessage forwards merged frame to store", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();

      const mergedFrame = {
        runId: RUN_ID,
        networkId: "net-1",
        round: 5,
        publicBelief: new Float32Array(2),
        privateBelief: new Float32Array(2),
        speaking: new Uint8Array(2),
      };
      mockWorker.onmessage?.({ data: mergedFrame } as MessageEvent);

      expect(mockStore.updateFrame).toHaveBeenCalledWith(mergedFrame);
    });

    describe("onEvent callback — control events", () => {
      async function getEventCallback(): Promise<(data: unknown) => Promise<void>> {
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        return onEvent as (data: unknown) => Promise<void>;
      }

      it("sets status to running on topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const onEvent = await getEventCallback();

        await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
      });

      it("calls getTopologyFull and setTopology on topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const onEvent = await getEventCallback();

        await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

        expect(simulationsApi.getTopologyFull).toHaveBeenCalledWith(RUN_ID, "net-1");
        expect(mockStore.setTopology).toHaveBeenCalledWith(MOCK_TOPOLOGY);
      });

      it("sends init to worker with agentCount on topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const onEvent = await getEventCallback();

        await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

        expect(mockWorker.postMessage).toHaveBeenCalledWith({
          type: "init",
          agentCount: MOCK_TOPOLOGY.agentCount,
        });
      });

      it("sets status to running on network_started", async () => {
        const onEvent = await getEventCallback();

        await onEvent({ event: "network_started", runId: RUN_ID, networkId: "net-1" });

        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
      });

      it("does not change run status on network_converged", async () => {
        const onEvent = await getEventCallback();

        await onEvent({ event: "network_converged", runId: RUN_ID, networkId: "net-1" });

        const calls = mockStore.setStatus.mock.calls.map((args) => args[0] as string);
        expect(calls).not.toContain("converged");
        expect(calls).not.toContain("completed");
      });

      it("sets status to completed on run_completed", async () => {
        const onEvent = await getEventCallback();

        await onEvent({ event: "run_completed", runId: RUN_ID });

        expect(mockStore.setStatus).toHaveBeenCalledWith("completed");
      });

      it("calls setError on error event", async () => {
        const onEvent = await getEventCallback();

        await onEvent({ event: "error", message: "something went wrong" });

        expect(mockStore.setError).toHaveBeenCalledWith("something went wrong");
      });
    });

    describe("onBinary callback — binary frames", () => {
      async function setupWithTopology() {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, onEvent, onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-1",
        });
        return { client, onBinary: onBinary as (buf: ArrayBuffer) => void };
      }

      it("drops binary frames received before topology_ready", async () => {
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, , onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        (onBinary as (buf: ArrayBuffer) => void)(makeFrameBuffer(MOCK_TOPOLOGY.agentCount));

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );
      });

      it("forwards ArrayBuffer to worker after topology is ready", async () => {
        const { onBinary } = await setupWithTopology();

        const buffer = makeFrameBuffer(MOCK_TOPOLOGY.agentCount);
        onBinary(buffer);

        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: "frame", buffer }, [buffer]);
      });
    });
  });

  describe("disconnect()", () => {
    it("calls manager.unsubscribe with runId", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      client.disconnect();
      expect(mockManager.unsubscribe).toHaveBeenCalledWith(RUN_ID);
    });

    it("terminates the Worker", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      client.disconnect();
      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });

  describe("replayBuffer()", () => {
    it("is a no-op before topology is ready", async () => {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();

      client.replayBuffer(new ArrayBuffer(8));

      expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "replay-buffer" }),
      );
    });

    it("posts replay-buffer to worker after topology is ready", async () => {
      vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();

      const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
      await (onEvent as (data: unknown) => Promise<void>)({
        event: "topology_ready",
        runId: RUN_ID,
        networkId: "net-1",
      });

      const buffer = new ArrayBuffer(16);
      client.replayBuffer(buffer);

      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: "replay-buffer", buffer }, [
        buffer,
      ]);
    });
  });
});
