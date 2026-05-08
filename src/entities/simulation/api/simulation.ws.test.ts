import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import { useSimulationStore } from "../model/simulation.store";
import { createSimulationWsClient } from "./simulation.ws";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    getWsTicket: vi.fn(),
    getTopology: vi.fn(),
    getTopologyFull: vi.fn(),
  },
}));

vi.mock("../model/simulation.store", () => ({
  useSimulationStore: {
    getState: vi.fn(),
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

type MockWebSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null;
  onerror: (() => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
  lastUrl: string;
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createSimulationWsClient", () => {
  let mockStore: MockStoreActions;
  let mockWs: MockWebSocket;
  let mockWorker: MockWorker;

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

    mockWs = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: vi.fn(),
      lastUrl: "",
    };

    const capturedWs = mockWs;
    vi.stubGlobal(
      "WebSocket",
      class MockWebSocketConstructor {
        onopen: (() => void) | null = null;
        onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null;
        onerror: (() => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        close = capturedWs.close;
        constructor(url: string) {
          capturedWs.lastUrl = url;
          Object.defineProperties(this, {
            onopen: {
              get: () => capturedWs.onopen,
              set: (v: (() => void) | null) => {
                capturedWs.onopen = v;
              },
              enumerable: true,
              configurable: true,
            },
            onmessage: {
              get: () => capturedWs.onmessage,
              set: (v: ((event: MessageEvent) => void | Promise<void>) | null) => {
                capturedWs.onmessage = v;
              },
              enumerable: true,
              configurable: true,
            },
            onerror: {
              get: () => capturedWs.onerror,
              set: (v: (() => void) | null) => {
                capturedWs.onerror = v;
              },
              enumerable: true,
              configurable: true,
            },
            onclose: {
              get: () => capturedWs.onclose,
              set: (v: ((event: CloseEvent) => void) | null) => {
                capturedWs.onclose = v;
              },
              enumerable: true,
              configurable: true,
            },
          });
        }
      },
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

    vi.mocked(simulationsApi.getWsTicket).mockResolvedValue({ wsTicket: "ticket-xyz" });
  });

  it("returns an object with connect and disconnect", () => {
    const client = createSimulationWsClient(RUN_ID);
    expect(typeof client.connect).toBe("function");
    expect(typeof client.disconnect).toBe("function");
  });

  describe("connect()", () => {
    it("calls getWsTicket with the runId", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      expect(simulationsApi.getWsTicket).toHaveBeenCalledWith(RUN_ID);
    });

    it("constructs a ws:// URL from an http base URL and includes the ticket", async () => {
      vi.stubEnv("PUBLIC_BACKEND_URL", "http://backend.local:9000");
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      expect(mockWs.lastUrl).toBe(
        `ws://backend.local:9000/simulations/${RUN_ID}/stream?ticket=ticket-xyz`,
      );
    });

    it("constructs a wss:// URL from an https base URL", async () => {
      vi.stubEnv("PUBLIC_BACKEND_URL", "https://backend.prod");
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      expect(mockWs.lastUrl).toBe(
        `wss://backend.prod/simulations/${RUN_ID}/stream?ticket=ticket-xyz`,
      );
    });

    it("sets runId and status to connecting before opening the socket", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      expect(mockStore.setRunId).toHaveBeenCalledWith(RUN_ID);
      expect(mockStore.setStatus).toHaveBeenCalledWith("connecting");
    });

    it("creates a Worker on connect", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      // Worker.onmessage should be wired up
      expect(mockWorker.onmessage).toBeTypeOf("function");
    });

    describe("ws.onopen", () => {
      it("sets status to running when the connection opens", async () => {
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();
        mockWs.onopen?.();
        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
      });
    });

    describe("ws.onmessage — control events", () => {
      async function triggerMessage(data: string) {
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();
        const event = { data } as MessageEvent;
        await mockWs.onmessage?.(event);
      }

      it("calls getTopology and setTopology on topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);

        await triggerMessage(
          JSON.stringify({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" }),
        );

        expect(simulationsApi.getTopologyFull).toHaveBeenCalledWith(RUN_ID, "net-1");
        expect(mockStore.setTopology).toHaveBeenCalledWith(MOCK_TOPOLOGY);
      });

      it("sends init message to worker with agentCount on topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);

        await triggerMessage(
          JSON.stringify({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" }),
        );

        expect(mockWorker.postMessage).toHaveBeenCalledWith({
          type: "init",
          agentCount: MOCK_TOPOLOGY.agentCount,
        });
      });

      it("sets status to running on network_started", async () => {
        await triggerMessage(
          JSON.stringify({ event: "network_started", runId: RUN_ID, networkId: "net-1" }),
        );
        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
      });

      it("does not change run status on network_converged (per-network event)", async () => {
        await triggerMessage(
          JSON.stringify({ event: "network_converged", runId: RUN_ID, networkId: "net-1" }),
        );
        const calls = mockStore.setStatus.mock.calls.map(([s]) => s);
        expect(calls).not.toContain("converged");
        expect(calls).not.toContain("completed");
        expect(calls).not.toContain("cancelled");
      });

      it("sets status to completed on run_completed", async () => {
        await triggerMessage(JSON.stringify({ event: "run_completed", runId: RUN_ID }));
        expect(mockStore.setStatus).toHaveBeenCalledWith("completed");
      });

      it("calls setError on error event", async () => {
        await triggerMessage(JSON.stringify({ event: "error", message: "something went wrong" }));
        expect(mockStore.setError).toHaveBeenCalledWith("something went wrong");
      });
    });

    describe("ws.onmessage — binary frame", () => {
      async function connectAndLoadTopology() {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();
        await mockWs.onmessage?.({
          data: JSON.stringify({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" }),
        } as MessageEvent);
        return client;
      }

      it("drops binary frames received before topology_ready", async () => {
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();

        const buffer = new ArrayBuffer(8);
        await mockWs.onmessage?.({ data: buffer } as MessageEvent);

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );
      });

      it("forwards ArrayBuffer to worker as transferable after topology is ready", async () => {
        await connectAndLoadTopology();

        const buffer = new ArrayBuffer(8);
        await mockWs.onmessage?.({ data: buffer } as MessageEvent);

        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: "frame", buffer }, [buffer]);
      });

      it("calls store.updateFrame when the worker emits a merged frame", async () => {
        await connectAndLoadTopology();

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
    });

    describe("ws.onclose", () => {
      it("does not reconnect when code is 1000", async () => {
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();

        vi.clearAllMocks();

        const closeEvent = { code: 1000 } as CloseEvent;
        mockWs.onclose?.(closeEvent);

        expect(simulationsApi.getWsTicket).not.toHaveBeenCalled();
        expect(mockStore.setStatus).not.toHaveBeenCalledWith("connecting");
      });

      it("sets status to connecting on unexpected close code", async () => {
        const client = createSimulationWsClient(RUN_ID);
        await client.connect();

        vi.mocked(simulationsApi.getWsTicket).mockResolvedValue({ wsTicket: "ticket-2" });

        const closeEvent = { code: 1006 } as CloseEvent;
        mockWs.onclose?.(closeEvent);

        expect(mockStore.setStatus).toHaveBeenCalledWith("connecting");
      });

      it("calls setError when the socket reconnect fails", async () => {
        const client = createSimulationWsClient(RUN_ID);
        vi.mocked(simulationsApi.getWsTicket).mockResolvedValueOnce({ wsTicket: "ticket-1" });
        await client.connect();

        vi.mocked(simulationsApi.getWsTicket).mockRejectedValue(new Error("network error"));

        const closeEvent = { code: 1006 } as CloseEvent;
        mockWs.onclose?.(closeEvent);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockStore.setError).toHaveBeenCalledWith(
          expect.stringContaining("reconnect failed"),
        );
      });
    });
  });

  describe("disconnect()", () => {
    it("closes the WebSocket with code 1000", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      client.disconnect();
      expect(mockWs.close).toHaveBeenCalledWith(1000);
    });

    it("terminates the Worker on disconnect", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      client.disconnect();
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it("does not reconnect after disconnect even when onclose fires", async () => {
      const client = createSimulationWsClient(RUN_ID);
      await client.connect();
      client.disconnect();

      vi.clearAllMocks();

      const closeEvent = { code: 1006 } as CloseEvent;
      mockWs.onclose?.(closeEvent);

      expect(simulationsApi.getWsTicket).not.toHaveBeenCalled();
    });
  });
});
