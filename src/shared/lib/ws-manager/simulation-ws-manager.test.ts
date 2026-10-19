import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/shared/api/firebase";
import { logger } from "@/shared/lib/logger";
import { SimulationWsManager } from "./simulation-ws-manager";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({
  auth: { currentUser: null as { getIdToken: () => Promise<string> } | null },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  binaryType = "blob";
  readyState: number = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

// Firebase's auth.currentUser is readonly in the real type; the mock needs to
// reassign it per test, so cast through this mutable shape.
type MutableAuth = { currentUser: { getIdToken: () => Promise<string> } | null };
const mockAuth = auth as unknown as MutableAuth;

/** Returns the most recently constructed mock socket. */
const lastWs = (): MockWebSocket =>
  MockWebSocket.instances[MockWebSocket.instances.length - 1] as MockWebSocket;

/** Snowflake-like run ids: binaries carry the runId in their header, so it must be numeric. */
const RUN_A = "342521980018098176";
const RUN_B = "342521980018098177";

/**
 * Server binary for `runId`: runId as int64 LE at header bytes 16-23 (frame
 * and topology headers alike). The manager routes on that field only.
 */
function binaryFor(runId: string, byteLength = 36 + 9): ArrayBuffer {
  const buffer = new ArrayBuffer(byteLength);
  new DataView(buffer).setBigUint64(16, BigInt(runId), true);
  return buffer;
}

/** Flushes pending microtasks (e.g. the async sendAuth handshake). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Drives a fresh manager up to the authenticated state and returns both. */
async function connectAndAuth(): Promise<{ manager: SimulationWsManager; ws: MockWebSocket }> {
  const manager = new SimulationWsManager();
  await manager.connect();
  const ws = lastWs();
  ws.onopen?.();
  await flush();
  ws.send.mockClear();
  ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", userId: "u1" }) } as MessageEvent);
  return { manager, ws };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SimulationWsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("id-token") };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("connect()", () => {
    it("opens a WebSocket at the derived ws:// URL with arraybuffer binaryType", async () => {
      const manager = new SimulationWsManager();
      await manager.connect();

      const ws = lastWs();
      expect(ws.url).toBe("ws://localhost:9000/ws");
      expect(ws.binaryType).toBe("arraybuffer");
      expect(manager.getAuthState()).toBe("connecting");
    });

    it("does not open a second socket when already OPEN", async () => {
      const manager = new SimulationWsManager();
      await manager.connect();
      await manager.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("sends an auth message with the Firebase token on open", async () => {
      const manager = new SimulationWsManager();
      await manager.connect();
      const ws = lastWs();

      ws.onopen?.();
      await flush();

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "auth", token: "id-token" }));
    });

    it("sets auth_failed when there is no Firebase user", async () => {
      mockAuth.currentUser = null;
      const manager = new SimulationWsManager();
      await manager.connect();
      const ws = lastWs();

      ws.onopen?.();
      await flush();

      expect(manager.getAuthState()).toBe("auth_failed");
      expect(logger.error).toHaveBeenCalled();
    });

    it("sets auth_failed when getIdToken rejects", async () => {
      mockAuth.currentUser = {
        getIdToken: vi.fn().mockRejectedValue(new Error("network")),
      };
      const manager = new SimulationWsManager();
      await manager.connect();
      const ws = lastWs();

      ws.onopen?.();
      await flush();

      expect(manager.getAuthState()).toBe("auth_failed");
      expect(logger.error).toHaveBeenCalled();
    });

    it("onerror is a no-op (reconnect handling happens in onclose)", async () => {
      const manager = new SimulationWsManager();
      await manager.connect();
      const ws = lastWs();

      expect(() => ws.onerror?.()).not.toThrow();
    });
  });

  describe("auth handshake", () => {
    it("transitions to auth_ok on the server auth_ok message", async () => {
      const { manager } = await connectAndAuth();
      expect(manager.getAuthState()).toBe("auth_ok");
    });

    it("sets auth_failed on a server error with code auth_failed", async () => {
      const manager = new SimulationWsManager();
      await manager.connect();
      const ws = lastWs();

      ws.onmessage?.({
        data: JSON.stringify({ type: "error", code: "auth_failed" }),
      } as MessageEvent);

      expect(manager.getAuthState()).toBe("auth_failed");
      expect(logger.error).toHaveBeenCalled();
    });

    it("logs but does not change auth state on a non-auth server error", async () => {
      const { manager } = await connectAndAuth();
      vi.mocked(logger.error).mockClear();
      const ws = lastWs();

      ws.onmessage?.({
        data: JSON.stringify({ type: "error", code: "rate_limited" }),
      } as MessageEvent);

      expect(manager.getAuthState()).toBe("auth_ok");
      expect(logger.error).toHaveBeenCalled();
    });

    it("broadcasts a control message with no matching runId to every subscription", async () => {
      const { manager, ws } = await connectAndAuth();
      const onEvent1 = vi.fn();
      const onEvent2 = vi.fn();
      manager.subscribe("run-1", onEvent1, vi.fn());
      manager.subscribe("run-2", onEvent2, vi.fn());

      // An unrecognized "type" (not auth_ok/error) with no runId falls through
      // to the generic WsControlEvent broadcast path.
      const globalMsg = { type: "server_notice", detail: "maintenance window" };
      ws.onmessage?.({ data: JSON.stringify(globalMsg) } as MessageEvent);

      expect(onEvent1).toHaveBeenCalledWith(globalMsg);
      expect(onEvent2).toHaveBeenCalledWith(globalMsg);
    });
  });

  describe("subscribe() / unsubscribe()", () => {
    it("sends a subscribe message when authenticated and no buffer exists", async () => {
      const { manager, ws } = await connectAndAuth();

      manager.subscribe("run-1", vi.fn(), vi.fn());

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", runId: "run-1" }));
    });

    it("does not send subscribe when not yet authenticated and no buffer exists", async () => {
      const manager = new SimulationWsManager();
      await manager.connect(); // authState is "connecting", not "auth_ok"
      const ws = lastWs();

      manager.subscribe("run-1", vi.fn(), vi.fn());

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("does not send a message when the socket is not open", async () => {
      const { manager, ws } = await connectAndAuth();
      ws.readyState = MockWebSocket.CLOSED;
      ws.send.mockClear();

      manager.subscribe("run-1", vi.fn(), vi.fn());

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("routes control events to the matching subscription", async () => {
      const { manager, ws } = await connectAndAuth();
      const onEvent = vi.fn();
      manager.subscribe("run-1", onEvent, vi.fn());

      const event = { event: "network_started", runId: "run-1", networkId: "net-1" };
      ws.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

      expect(onEvent).toHaveBeenCalledWith(event);
    });

    it("delivers a binary frame to the subscription of the run in its header", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinary = vi.fn();
      manager.subscribe(RUN_A, vi.fn(), onBinary);

      const buffer = binaryFor(RUN_A);
      ws.onmessage?.({ data: buffer } as MessageEvent);

      expect(onBinary).toHaveBeenCalledOnce();
      // Single recipient: handed over as is (it may transfer it to its worker).
      expect(onBinary).toHaveBeenCalledWith(buffer);
    });

    it("routes each binary only to its own run when several runs are subscribed", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinaryA = vi.fn();
      const onBinaryB = vi.fn();
      manager.subscribe(RUN_A, vi.fn(), onBinaryA);
      manager.subscribe(RUN_B, vi.fn(), onBinaryB);

      const frameA = binaryFor(RUN_A);
      const frameB = binaryFor(RUN_B);
      ws.onmessage?.({ data: frameA } as MessageEvent);
      ws.onmessage?.({ data: frameB } as MessageEvent);

      expect(onBinaryA.mock.calls).toEqual([[frameA]]);
      expect(onBinaryB.mock.calls).toEqual([[frameB]]);
    });

    it("drops a binary of a run with no subscription or prepared buffer here", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinary = vi.fn();
      manager.subscribe(RUN_A, vi.fn(), onBinary);

      ws.onmessage?.({ data: binaryFor(RUN_B) } as MessageEvent);

      expect(onBinary).not.toHaveBeenCalled();
    });

    it("drops a binary too short to carry a runId", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinary = vi.fn();
      manager.subscribe(RUN_A, vi.fn(), onBinary);

      ws.onmessage?.({ data: new ArrayBuffer(23) } as MessageEvent);

      expect(onBinary).not.toHaveBeenCalled();
    });

    it("drops a binary frame when there are no subscriptions or buffered runs", async () => {
      const { ws } = await connectAndAuth();

      expect(() => ws.onmessage?.({ data: new ArrayBuffer(4) } as MessageEvent)).not.toThrow();
      expect(() => ws.onmessage?.({ data: binaryFor(RUN_A) } as MessageEvent)).not.toThrow();
    });

    it("sends unsubscribe and stops routing after unsubscribe()", async () => {
      const { manager, ws } = await connectAndAuth();
      const onEvent = vi.fn();
      manager.subscribe("run-1", onEvent, vi.fn());
      ws.send.mockClear();

      manager.unsubscribe("run-1");

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "unsubscribe", runId: "run-1" }));

      onEvent.mockClear();
      ws.onmessage?.({
        data: JSON.stringify({ event: "network_started", runId: "run-1", networkId: "n" }),
      } as MessageEvent);
      expect(onEvent).not.toHaveBeenCalled();
    });

    it("does not send unsubscribe for an unknown runId", async () => {
      const { manager, ws } = await connectAndAuth();
      manager.unsubscribe("ghost");
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("prepareRun() buffering", () => {
    it("eagerly sends subscribe and buffers events until a consumer subscribes", async () => {
      const { manager, ws } = await connectAndAuth();

      manager.prepareRun(RUN_A);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", runId: RUN_A }));

      // Event + binary arrive before any UI consumer
      const event = { event: "topology_ready", runId: RUN_A, networkId: "net-1" };
      const frame = binaryFor(RUN_A);
      ws.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
      ws.onmessage?.({ data: frame } as MessageEvent);

      const onEvent = vi.fn();
      const onBinary = vi.fn();
      manager.subscribe(RUN_A, onEvent, onBinary);

      expect(onEvent).toHaveBeenCalledWith(event);
      expect(onBinary.mock.calls).toEqual([[frame]]);
    });

    it("buffers a prepared run's frames even while another run is subscribed", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinaryA = vi.fn();
      manager.subscribe(RUN_A, vi.fn(), onBinaryA);
      manager.prepareRun(RUN_B);

      const frameB = binaryFor(RUN_B);
      ws.onmessage?.({ data: frameB } as MessageEvent);
      expect(onBinaryA).not.toHaveBeenCalled();

      const onBinaryB = vi.fn();
      manager.subscribe(RUN_B, vi.fn(), onBinaryB);
      expect(onBinaryB.mock.calls).toEqual([[frameB]]);
    });

    it("drops a stale prepared run (unsubscribe) when a new one is prepared", async () => {
      const { manager, ws } = await connectAndAuth();

      manager.prepareRun("run-old");
      ws.send.mockClear();
      manager.prepareRun("run-new");

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "unsubscribe", runId: "run-old" }),
      );
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", runId: "run-new" }));
    });

    it("is a no-op when the run is already subscribed", async () => {
      const { manager, ws } = await connectAndAuth();
      manager.subscribe("run-1", vi.fn(), vi.fn());
      ws.send.mockClear();

      manager.prepareRun("run-1");

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("does not send subscribe/unsubscribe for prepared runs before auth_ok", async () => {
      const manager = new SimulationWsManager();
      await manager.connect(); // authState is "connecting", not "auth_ok"
      const ws = lastWs();

      manager.prepareRun("run-old");
      manager.prepareRun("run-new"); // triggers the stale-buffer cleanup path

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("auth state listeners", () => {
    it("emits the current state immediately and on change, and supports unsubscribe", async () => {
      const manager = new SimulationWsManager();
      const listener = vi.fn();

      const off = manager.onAuthStateChange(listener);
      expect(listener).toHaveBeenCalledWith("idle");

      await manager.connect();
      expect(listener).toHaveBeenCalledWith("connecting");

      off();
      listener.mockClear();
      manager.destroy();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("reconnect on close", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not reconnect on a normal-closure code (1000)", () => {
      const manager = new SimulationWsManager();
      manager.connect();
      const ws = lastWs();

      ws.onclose?.({ code: 1000 } as CloseEvent);
      vi.advanceTimersByTime(5000);

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(manager.getAuthState()).toBe("auth_failed");
    });

    it("schedules a reconnect with backoff on an abnormal close", () => {
      const manager = new SimulationWsManager();
      manager.connect();
      const ws = lastWs();

      ws.onclose?.({ code: 1006 } as CloseEvent);
      expect(manager.getAuthState()).toBe("reconnecting");

      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    });

    it("gives up after the max attempts", () => {
      const manager = new SimulationWsManager();
      manager.connect();

      for (let i = 0; i < 6; i++) {
        const ws = lastWs();
        ws.onclose?.({ code: 1006 } as CloseEvent);
        vi.advanceTimersByTime(60_000);
      }

      expect(manager.getAuthState()).toBe("auth_failed");
    });

    it("destroy() cancels a pending reconnect and closes the socket", () => {
      const manager = new SimulationWsManager();
      manager.connect();
      const ws = lastWs();

      ws.onclose?.({ code: 1006 } as CloseEvent);
      manager.destroy();
      const countAfterDestroy = MockWebSocket.instances.length;
      vi.advanceTimersByTime(60_000);

      expect(MockWebSocket.instances).toHaveLength(countAfterDestroy);
      expect(manager.getAuthState()).toBe("idle");
    });

    it("ignores a stale onclose that fires after destroy() (no reconnect scheduled)", () => {
      const manager = new SimulationWsManager();
      manager.connect();
      const ws = lastWs();

      manager.destroy();
      ws.onclose?.({ code: 1006 } as CloseEvent);
      vi.advanceTimersByTime(60_000);

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(manager.getAuthState()).toBe("idle");
    });

    it("logs an error when the reconnect's own connect() attempt throws", async () => {
      const manager = new SimulationWsManager();
      manager.connect();
      const ws = lastWs();

      ws.onclose?.({ code: 1006 } as CloseEvent);

      // Make the socket construction inside the scheduled connect() reject.
      vi.stubGlobal(
        "WebSocket",
        class {
          constructor() {
            throw new Error("boom");
          }
        },
      );

      await vi.advanceTimersByTimeAsync(1000);

      expect(logger.error).toHaveBeenCalledWith("SimulationWsManager.reconnect", expect.any(Error));
    });
  });

  describe("destroy()", () => {
    it("closes the socket with code 1000 and resets to idle", async () => {
      const { manager, ws } = await connectAndAuth();

      manager.destroy();

      expect(ws.close).toHaveBeenCalledWith(1000);
      expect(manager.getAuthState()).toBe("idle");
    });
  });

  describe("resubscribeAll on re-auth", () => {
    it("re-sends subscribe for active subscriptions and prepared buffers", async () => {
      const { manager, ws } = await connectAndAuth();
      manager.subscribe("run-active", vi.fn(), vi.fn());
      manager.prepareRun("run-prepared");
      ws.send.mockClear();

      // Server re-auth (e.g. after a reconnect)
      ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", userId: "u1" }) } as MessageEvent);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "subscribe", runId: "run-active" }),
      );
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "subscribe", runId: "run-prepared" }),
      );
    });
  });
});
