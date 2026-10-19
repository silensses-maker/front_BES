import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulationsApi } from "@/shared/api/backend";
import type { SimulationWsManager } from "@/shared/lib/ws-manager";
import { useSimulationStore } from "../model/simulation.store";
import { createSimulationWsClient, isFrameBinary, readFinalRound } from "./simulation.ws";

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
  setNetworkId: ReturnType<typeof vi.fn>;
  setTopology: ReturnType<typeof vi.fn>;
  ingestLiveFrame: ReturnType<typeof vi.fn>;
  setFinalRound: ReturnType<typeof vi.fn>;
  setConsensus: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  topology: unknown;
};

type MockWorker = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Snowflake-like: frames carry the runId in their header (int64 at 16-23).
const RUN_ID = "342521980018098176";
const OTHER_RUN_ID = "342521980018098177";

import { useLastRunStore } from "../model/last-run.store";

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
 * Builds a valid binary frame buffer the client will recognise: total size
 * `36 + 9 × numberOfAgents` (numberOfAgents is an int32 at offset 24), a
 * plausible header (round at 28 and startsAt at 32, both ≥ 0) and the run's
 * id at 16-23 (int64). A bare ArrayBuffer fails those checks and gets dropped.
 */
function makeFrameBuffer(
  numberOfAgents: number,
  round = 0,
  startsAt = 0,
  runId = RUN_ID,
): ArrayBuffer {
  const buffer = new ArrayBuffer(36 + 9 * numberOfAgents);
  const view = new DataView(buffer);
  view.setBigUint64(16, BigInt(runId), true);
  view.setInt32(24, numberOfAgents, true);
  view.setInt32(28, round, true);
  view.setInt32(32, startsAt, true);
  return buffer;
}

/** Topology binary as the backend sends it with APP_WS_SEND_TOPOLOGY=true. */
function makeTopologyBuffer(agents: number, neighbors: number): ArrayBuffer {
  const buffer = new ArrayBuffer(32 + 4 * agents + 9 * neighbors);
  const view = new DataView(buffer);
  view.setInt32(24, agents, true);
  view.setInt32(28, neighbors, true);
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
      setNetworkId: vi.fn(),
      setTopology: vi.fn(),
      ingestLiveFrame: vi.fn(),
      setFinalRound: vi.fn(),
      setConsensus: vi.fn(),
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

    it("worker onmessage forwards merged frame to store via the live-ingest path", async () => {
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

      expect(mockStore.ingestLiveFrame).toHaveBeenCalledWith(mergedFrame);
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

      it("calls setNetworkId and setFinalRound on network_converged", async () => {
        const onEvent = await getEventCallback();

        await onEvent({
          event: "network_converged",
          runId: RUN_ID,
          networkId: "net-1",
          finalRound: 42,
          consensus: true,
        });

        expect(mockStore.setNetworkId).toHaveBeenCalledWith("net-1");
        expect(mockStore.setFinalRound).toHaveBeenCalledWith(42);
      });

      it("reads the legacy `round` field of network_converged (backends before #119)", async () => {
        const onEvent = await getEventCallback();

        await onEvent({
          event: "network_converged",
          runId: RUN_ID,
          networkId: "net-1",
          round: 17,
          consensus: true,
        });

        expect(mockStore.setFinalRound).toHaveBeenCalledWith(17);
      });

      it("leaves finalRound and consensus untouched when network_converged lacks them", async () => {
        const onEvent = await getEventCallback();

        await onEvent({ event: "network_converged", runId: RUN_ID, networkId: "net-1" });

        // Never undefined in the store: the `/results` fallbacks only fill null.
        expect(mockStore.setNetworkId).toHaveBeenCalledWith("net-1");
        expect(mockStore.setFinalRound).not.toHaveBeenCalled();
        expect(mockStore.setConsensus).not.toHaveBeenCalled();
      });

      it("stores the consensus verdict on network_converged", async () => {
        const onEvent = await getEventCallback();

        await onEvent({
          event: "network_converged",
          runId: RUN_ID,
          networkId: "net-1",
          finalRound: 42,
          consensus: false,
        });

        expect(mockStore.setConsensus).toHaveBeenCalledWith(false);
      });

      describe("topology_ready idempotency (store already populated)", () => {
        it("skips the REST refetch and initializes the worker directly when the store already has this network's topology", async () => {
          const onEvent = await getEventCallback();
          // Simulate useSimulationStream's proactive REST fetch having already
          // populated the topology for this network before the WS event arrives.
          mockStore.topology = MOCK_TOPOLOGY;

          await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

          expect(simulationsApi.getTopologyFull).not.toHaveBeenCalled();
          expect(mockStore.setTopology).not.toHaveBeenCalled();
          expect(mockWorker.postMessage).toHaveBeenCalledWith({
            type: "init",
            agentCount: MOCK_TOPOLOGY.agentCount,
          });
        });

        it("does not re-initialize the worker on a duplicate topology_ready once already initialized", async () => {
          const onEvent = await getEventCallback();
          mockStore.topology = MOCK_TOPOLOGY;

          await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });
          mockWorker.postMessage.mockClear();
          await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

          expect(mockWorker.postMessage).not.toHaveBeenCalled();
        });
      });

      it("does nothing when getTopologyFull resolves with no topology", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(null);
        const onEvent = await getEventCallback();

        await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

        expect(mockStore.setTopology).not.toHaveBeenCalled();
        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "init" }),
        );
      });

      it("does not overwrite the store's topology when it was populated for the same network while the REST call was in flight", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockImplementation(async () => {
          // Simulate a race: the proactive REST fetch (useSimulationStream)
          // resolves and populates the store for this network while this
          // WS-driven fetch is still awaiting its own response.
          mockStore.topology = MOCK_TOPOLOGY;
          return MOCK_TOPOLOGY;
        });
        const onEvent = await getEventCallback();

        await onEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });

        expect(mockStore.setTopology).not.toHaveBeenCalled();
        expect(mockWorker.postMessage).toHaveBeenCalledWith({
          type: "init",
          agentCount: MOCK_TOPOLOGY.agentCount,
        });
      });

      it("swallows a rejected getTopologyFull instead of surfacing an unhandled rejection", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockRejectedValue(new Error("network error"));
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        // Grab the raw onEvent callback registered with the manager: it is a
        // fire-and-forget `(event) => { handleControlEvent(event).catch(() => {}) }`
        // wrapper that does not itself return the underlying promise, so
        // rejections from the REST call must be swallowed internally.
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        const rawOnEvent = onEvent as (data: unknown) => void;

        expect(() => {
          rawOnEvent({ event: "topology_ready", runId: RUN_ID, networkId: "net-1" });
        }).not.toThrow();

        // Flush pending microtasks/macrotasks so the internal `.catch(() => {})`
        // actually runs before the test (and the process) moves on.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    });

    describe("networkId scoping", () => {
      it("uses the default networkId (null) — accepting any network — when the argument is omitted", async () => {
        const client = createSimulationWsClient(RUN_ID, undefined, mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "network_started",
          runId: RUN_ID,
          networkId: "whichever-network",
        });

        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
      });

      it("drops topology_ready events for a network other than the one being watched", async () => {
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-OTHER",
        });

        expect(mockStore.setStatus).not.toHaveBeenCalledWith("running");
        expect(simulationsApi.getTopologyFull).not.toHaveBeenCalled();
      });

      it("drops network_started events for a network other than the one being watched", async () => {
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "network_started",
          runId: RUN_ID,
          networkId: "net-OTHER",
        });

        expect(mockStore.setStatus).not.toHaveBeenCalledWith("running");
      });

      it("drops network_converged events for a network other than the one being watched", async () => {
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "network_converged",
          runId: RUN_ID,
          networkId: "net-OTHER",
          finalRound: 99,
          consensus: false,
        });

        expect(mockStore.setNetworkId).not.toHaveBeenCalled();
        expect(mockStore.setFinalRound).not.toHaveBeenCalled();
      });

      it("processes topology_ready for the matching scoped networkId", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-1",
        });

        expect(mockStore.setStatus).toHaveBeenCalledWith("running");
        expect(simulationsApi.getTopologyFull).toHaveBeenCalledWith(RUN_ID, "net-1");
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

      it("drains frames queued before topology_ready into the worker once it arrives", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, onEvent, onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        const queuedBuffer = makeFrameBuffer(MOCK_TOPOLOGY.agentCount);
        (onBinary as (buf: ArrayBuffer) => void)(queuedBuffer);
        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );

        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-1",
        });

        expect(mockWorker.postMessage).toHaveBeenCalledWith(
          { type: "frame", buffer: queuedBuffer },
          [queuedBuffer],
        );
      });

      it("drops non-frame binaries smaller than the 36-byte frame header (e.g. topology CSR binary)", async () => {
        const { onBinary } = await setupWithTopology();

        const tooSmall = new ArrayBuffer(16);
        onBinary(tooSmall);

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );
      });

      it("drops a topology binary (APP_WS_SEND_TOPOLOGY=true) instead of feeding it to the worker", async () => {
        const { onBinary } = await setupWithTopology();

        onBinary(makeTopologyBuffer(10, 7));

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );
      });

      it("drops frame-sized binaries whose header is implausible", async () => {
        const { onBinary } = await setupWithTopology();

        onBinary(makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 3, -1));
        onBinary(makeFrameBuffer(MOCK_TOPOLOGY.agentCount, -1, 0));

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );
      });

      it("forwards DB-replay frames — one message per persisted partition — in arrival order", async () => {
        const { onBinary } = await setupWithTopology();
        // Since #119 the DB replay sends each network_frames row as its own
        // message (same protocol as live frames), ordered by (round, startsAt).
        const partitions = [
          makeFrameBuffer(1, 0, 0),
          makeFrameBuffer(1, 0, 1),
          makeFrameBuffer(1, 1, 0),
          makeFrameBuffer(1, 1, 1),
        ];
        for (const p of partitions) onBinary(p);

        const forwarded = mockWorker.postMessage.mock.calls
          .map(([msg]) => msg as { type: string; buffer?: ArrayBuffer })
          .filter((msg) => msg.type === "frame")
          .map((msg) => msg.buffer);
        expect(forwarded).toEqual(partitions);
        expect(forwarded[2]).toBe(partitions[2]);
      });

      it("drops another run's frames when watching any network (networkId null)", async () => {
        const { onBinary } = await setupWithTopology();

        onBinary(makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 0, 0, OTHER_RUN_ID));
        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );

        const ownFrame = makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 0, 0, RUN_ID);
        onBinary(ownFrame);
        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: "frame", buffer: ownFrame }, [
          ownFrame,
        ]);
      });

      it("does not queue another run's frames before topology_ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, onEvent, onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;

        const foreign = makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 0, 0, OTHER_RUN_ID);
        const own = makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 0, 0, RUN_ID);
        (onBinary as (buf: ArrayBuffer) => void)(foreign);
        (onBinary as (buf: ArrayBuffer) => void)(own);
        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-1",
        });

        const forwarded = mockWorker.postMessage.mock.calls
          .map(([msg]) => msg as { type: string; buffer?: ArrayBuffer })
          .filter((msg) => msg.type === "frame")
          .map((msg) => msg.buffer);
        expect(forwarded).toEqual([own]);
        expect(forwarded[0]).toBe(own);
      });

      it("drops another run's frames when scoped, even for the watched network", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const watchedUuid = "00000000-0000-0000-0000-000000000001";
        const client = createSimulationWsClient(RUN_ID, watchedUuid, mockManager);
        await client.connect();
        const [, onEvent, onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: watchedUuid,
        });

        const watchedFrameOf = (runId: string): ArrayBuffer => {
          const buffer = makeFrameBuffer(MOCK_TOPOLOGY.agentCount, 0, 0, runId);
          new DataView(buffer).setBigInt64(8, 1n, true);
          return buffer;
        };

        (onBinary as (buf: ArrayBuffer) => void)(watchedFrameOf(OTHER_RUN_ID));
        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );

        const ownFrame = watchedFrameOf(RUN_ID);
        (onBinary as (buf: ArrayBuffer) => void)(ownFrame);
        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: "frame", buffer: ownFrame }, [
          ownFrame,
        ]);
      });

      it("drops other networks' frames when scoped (multi-network run pollution)", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const watchedUuid = "00000000-0000-0000-0000-000000000001";
        const client = createSimulationWsClient(RUN_ID, watchedUuid, mockManager);
        await client.connect();
        const [, onEvent, onBinary] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: watchedUuid,
        });

        // Frame header carries the network UUID (lsb at offset 8)
        const frameFor = (networkLsb: number): ArrayBuffer => {
          const buffer = makeFrameBuffer(MOCK_TOPOLOGY.agentCount);
          new DataView(buffer).setBigInt64(8, BigInt(networkLsb), true);
          return buffer;
        };

        const otherNetworkFrame = frameFor(2);
        onBinary(otherNetworkFrame);
        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "frame" }),
        );

        const watchedFrame = frameFor(1);
        onBinary(watchedFrame);
        expect(mockWorker.postMessage).toHaveBeenCalledWith(
          { type: "frame", buffer: watchedFrame },
          [watchedFrame],
        );
      });
    });

    describe("store subscription — topology arriving outside the WS event", () => {
      // Reconnect safety net: topology_ready fires only once per network
      // lifetime. If topology lands in the store (e.g. via useSimulationStream's
      // proactive REST fetch) before or instead of the WS event, this
      // subscription must catch it and initialize the worker so binary frames
      // are not silently dropped forever.
      function getSubscribedListener(): (state: { topology: unknown }) => void {
        const [listener] = vi.mocked(useSimulationStore.subscribe).mock.calls[0]!;
        return listener as (state: { topology: unknown }) => void;
      }

      it("does nothing while the store's topology is still null", async () => {
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const listener = getSubscribedListener();

        listener({ topology: null });

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "init" }),
        );
      });

      it("initializes the worker once the store's topology appears, when watching any network (networkId null)", async () => {
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const listener = getSubscribedListener();

        listener({ topology: MOCK_TOPOLOGY });

        expect(mockWorker.postMessage).toHaveBeenCalledWith({
          type: "init",
          agentCount: MOCK_TOPOLOGY.agentCount,
        });
      });

      it("initializes the worker once the store's topology appears for the scoped networkId", async () => {
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const listener = getSubscribedListener();

        listener({ topology: MOCK_TOPOLOGY });

        expect(mockWorker.postMessage).toHaveBeenCalledWith({
          type: "init",
          agentCount: MOCK_TOPOLOGY.agentCount,
        });
      });

      it("ignores a store topology update for a different network than the one being watched", async () => {
        const client = createSimulationWsClient(RUN_ID, "net-1", mockManager);
        await client.connect();
        const listener = getSubscribedListener();

        listener({ topology: { ...MOCK_TOPOLOGY, networkId: "net-OTHER" } });

        expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "init" }),
        );
      });

      it("unsubscribes from the store after initializing the worker from a store update", async () => {
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const listener = getSubscribedListener();
        const unsubscribe = vi.mocked(useSimulationStore.subscribe).mock.results[0]!.value;

        listener({ topology: MOCK_TOPOLOGY });

        expect(unsubscribe).toHaveBeenCalled();
      });

      it("does not re-initialize the worker from a store update once topology is already ready", async () => {
        vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(MOCK_TOPOLOGY);
        const client = createSimulationWsClient(RUN_ID, null, mockManager);
        await client.connect();
        const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
        // Mark topology as ready via the normal WS control-event path first.
        await (onEvent as (data: unknown) => Promise<void>)({
          event: "topology_ready",
          runId: RUN_ID,
          networkId: "net-1",
        });
        mockWorker.postMessage.mockClear();
        const listener = getSubscribedListener();

        listener({ topology: MOCK_TOPOLOGY });

        expect(mockWorker.postMessage).not.toHaveBeenCalled();
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

  describe("last-run store mirroring", () => {
    async function connectAndGetEvent(): Promise<(data: unknown) => Promise<void>> {
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();
      const [, onEvent] = vi.mocked(mockManager.subscribe).mock.calls[0]!;
      return onEvent as (data: unknown) => Promise<void>;
    }

    it("mirrors run_completed to the last-run store when runId matches", async () => {
      useLastRunStore.getState().startRun({ runId: RUN_ID, name: null, networkCount: 1 });
      const onEvent = await connectAndGetEvent();

      await onEvent({ event: "run_completed", runId: RUN_ID });

      expect(useLastRunStore.getState().status).toBe("completed");
    });

    it("mirrors error events to the last-run store when runId matches", async () => {
      useLastRunStore.getState().startRun({ runId: RUN_ID, name: null, networkCount: 1 });
      const onEvent = await connectAndGetEvent();

      await onEvent({ event: "error", message: "boom" });

      expect(useLastRunStore.getState().status).toBe("error");
    });

    it("does not touch the last-run store when it tracks a different run", async () => {
      useLastRunStore.getState().startRun({ runId: "other-run", name: null, networkCount: 1 });
      const onEvent = await connectAndGetEvent();

      await onEvent({ event: "run_completed", runId: RUN_ID });

      expect(useLastRunStore.getState().status).toBe("running");
    });

    it("mirrors the frame round from the worker when runId matches", async () => {
      useLastRunStore.getState().startRun({ runId: RUN_ID, name: null, networkCount: 1 });
      const client = createSimulationWsClient(RUN_ID, null, mockManager);
      await client.connect();

      mockWorker.onmessage?.({ data: { round: 57 } } as MessageEvent);

      expect(useLastRunStore.getState().round).toBe(57);
      expect(mockStore.ingestLiveFrame).toHaveBeenCalled();
    });
  });
});

describe("isFrameBinary", () => {
  it("accepts a frame of 36 + 9n bytes with a plausible header", () => {
    expect(isFrameBinary(makeFrameBuffer(3, 12, 64))).toBe(true);
  });

  it("rejects binaries shorter than the 36-byte header", () => {
    expect(isFrameBinary(new ArrayBuffer(35))).toBe(false);
  });

  it("rejects a header with no agents (36-byte message)", () => {
    expect(isFrameBinary(makeFrameBuffer(0))).toBe(false);
  });

  it("rejects a negative agent count", () => {
    const buffer = new ArrayBuffer(36 + 9 * 2);
    new DataView(buffer).setInt32(24, -2, true);
    expect(isFrameBinary(buffer)).toBe(false);
  });

  it("rejects a size that does not match 36 + 9n", () => {
    const buffer = new ArrayBuffer(36 + 9 * 2 + 1);
    new DataView(buffer).setInt32(24, 2, true);
    expect(isFrameBinary(buffer)).toBe(false);
  });

  it("rejects a negative round or startsAt", () => {
    expect(isFrameBinary(makeFrameBuffer(2, -1, 0))).toBe(false);
    expect(isFrameBinary(makeFrameBuffer(2, 0, -5))).toBe(false);
  });

  it("rejects a topology binary whose size is not a frame size", () => {
    expect(isFrameBinary(makeTopologyBuffer(4, 3))).toBe(false);
  });
});

describe("readFinalRound", () => {
  const base = { event: "network_converged" as const, runId: RUN_ID, networkId: "net-1" };

  it("reads finalRound (canonical field)", () => {
    expect(readFinalRound({ ...base, finalRound: 42, consensus: true })).toBe(42);
  });

  it("keeps a finalRound of 0", () => {
    expect(readFinalRound({ ...base, finalRound: 0, consensus: false })).toBe(0);
  });

  it("falls back to the legacy round field", () => {
    expect(readFinalRound({ ...base, round: 9, consensus: true })).toBe(9);
  });

  it("prefers finalRound over round when both are present", () => {
    expect(readFinalRound({ ...base, finalRound: 5, round: 6, consensus: true })).toBe(5);
  });

  it("returns null — not undefined — when neither field is a number", () => {
    expect(readFinalRound({ ...base, consensus: true })).toBeNull();
    expect(
      readFinalRound({ ...base, finalRound: null as unknown as number, consensus: true }),
    ).toBeNull();
  });
});
