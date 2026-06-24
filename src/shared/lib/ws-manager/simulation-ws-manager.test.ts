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
  });

  describe("subscribe() / unsubscribe()", () => {
    it("sends a subscribe message when authenticated and no buffer exists", async () => {
      const { manager, ws } = await connectAndAuth();

      manager.subscribe("run-1", vi.fn(), vi.fn());

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", runId: "run-1" }));
    });

    it("routes control events to the matching subscription", async () => {
      const { manager, ws } = await connectAndAuth();
      const onEvent = vi.fn();
      manager.subscribe("run-1", onEvent, vi.fn());

      const event = { event: "network_started", runId: "run-1", networkId: "net-1" };
      ws.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

      expect(onEvent).toHaveBeenCalledWith(event);
    });

    it("forwards binary frames as per-subscriber copies", async () => {
      const { manager, ws } = await connectAndAuth();
      const onBinary = vi.fn();
      manager.subscribe("run-1", vi.fn(), onBinary);

      const buffer = new ArrayBuffer(8);
      ws.onmessage?.({ data: buffer } as MessageEvent);

      expect(onBinary).toHaveBeenCalledOnce();
      const received = onBinary.mock.calls[0]![0] as ArrayBuffer;
      expect(received.byteLength).toBe(8);
      expect(received).not.toBe(buffer); // copy, not the same reference
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

      manager.prepareRun("run-1");
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", runId: "run-1" }));

      // Event + binary arrive before any UI consumer
      const event = { event: "topology_ready", runId: "run-1", networkId: "net-1" };
      ws.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
      ws.onmessage?.({ data: new ArrayBuffer(4) } as MessageEvent);

      const onEvent = vi.fn();
      const onBinary = vi.fn();
      manager.subscribe("run-1", onEvent, onBinary);

      expect(onEvent).toHaveBeenCalledWith(event);
      expect(onBinary).toHaveBeenCalledOnce();
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
