import type { WsControlEvent } from "@/entities/simulation/types/simulation.types";
import { auth } from "@/shared/api/firebase";
import { logger } from "@/shared/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WsAuthState = "idle" | "connecting" | "auth_ok" | "auth_failed" | "reconnecting";

export type WsEventCallback = (event: WsControlEvent) => void;
export type WsBinaryCallback = (buffer: ArrayBuffer) => void;

interface RunSubscription {
  onEvent: WsEventCallback;
  onBinary: WsBinaryCallback;
}

/**
 * Holds events/binary frames that arrive between an eager `prepareRun()` call
 * and the moment a real consumer calls `subscribe()`. Drained into the
 * consumer's callbacks the moment subscribe runs.
 */
interface BufferedRun {
  events: WsControlEvent[];
  binaries: ArrayBuffer[];
}

// ─── Client messages sent to the server ──────────────────────────────────────

interface AuthMessage {
  type: "auth";
  token: string;
}

interface SubscribeMessage {
  type: "subscribe";
  runId: string;
}

interface UnsubscribeMessage {
  type: "unsubscribe";
  runId: string;
}

type ClientMessage = AuthMessage | SubscribeMessage | UnsubscribeMessage;

// ─── Server control messages ──────────────────────────────────────────────────

interface AuthOkMessage {
  type: "auth_ok";
  userId: string;
}

interface ErrorMessage {
  type: "error";
  code: string;
}

type ServerControlMessage = AuthOkMessage | ErrorMessage | WsControlEvent;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

/**
 * Close codes that should not trigger reconnect.
 * 1000 = normal closure, 1008 = policy violation (auth failure)
 */
const NO_RETRY_CODES = new Set([1000, 1008]);

// ─── Manager ─────────────────────────────────────────────────────────────────

/**
 * Singleton-per-session WebSocket manager for simulation streams.
 *
 * Lifecycle:
 * 1. `connect()` — opens WS, performs auth handshake with Firebase idToken.
 * 2. `prepareRun(runId)` (optional, recommended) — sends subscribe to the
 *    server eagerly (e.g. immediately after POST /simulations returns the
 *    runId) and starts buffering events/binary frames. Closes the race
 *    window between launch and UI mount.
 * 3. `subscribe(runId, onEvent, onBinary)` — registers callbacks; drains any
 *    buffer left by prepareRun, otherwise sends subscribe now.
 * 4. `unsubscribe(runId)` — sends unsubscribe, removes callbacks and buffer.
 * 5. On disconnect/close: re-authenticates, then re-subscribes all active
 *    runs AND prepared runs.
 * 6. `destroy()` — permanent close; no reconnect.
 */
export class SimulationWsManager {
  private ws: WebSocket | null = null;
  private authState: WsAuthState = "idle";
  private subscriptions = new Map<string, RunSubscription>();
  // Eagerly-subscribed runs that don't yet have a UI consumer. Holds events
  // and binary frames until subscribe() is called for that runId.
  private buffers = new Map<string, BufferedRun>();
  private reconnectAttempts = 0;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Auth-state listeners (for provider / context) ─────────────────────────
  private authListeners = new Set<(state: WsAuthState) => void>();

  onAuthStateChange(listener: (state: WsAuthState) => void): () => void {
    this.authListeners.add(listener);
    // Emit current state immediately so late subscribers see the right value
    listener(this.authState);
    return () => {
      this.authListeners.delete(listener);
    };
  }

  private setAuthState(state: WsAuthState): void {
    this.authState = state;
    for (const l of this.authListeners) l(state);
  }

  getAuthState(): WsAuthState {
    return this.authState;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // Reset destroyed so StrictMode's cleanup→remount cycle reconnects cleanly.
    // A call to destroy() followed by connect() is intentional reconnect.
    this.destroyed = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.setAuthState("connecting");

    const baseUrl = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:9000";
    const wsBase = baseUrl.replace(/^https/, "wss").replace(/^http/, "ws");
    const url = `${wsBase}/ws`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.sendAuth();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        this.handleTextMessage(JSON.parse(event.data) as ServerControlMessage);
        return;
      }
      // Route to active subscribers; otherwise buffer for any prepared (but
      // not yet subscribed) run so frames that arrive between launch and UI
      // mount aren't lost.
      const buffer = event.data as ArrayBuffer;
      if (this.subscriptions.size > 0) {
        for (const sub of this.subscriptions.values()) {
          // Each subscriber gets its own copy (transferable semantics)
          sub.onBinary(buffer.slice(0));
        }
      } else if (this.buffers.size > 0) {
        for (const buf of this.buffers.values()) {
          buf.binaries.push(buffer.slice(0));
        }
      }
    };

    this.ws.onerror = () => {
      // onclose fires right after; handle reconnect there
    };

    this.ws.onclose = (ev: CloseEvent) => {
      this.ws = null;
      if (this.destroyed) return;
      if (NO_RETRY_CODES.has(ev.code)) {
        logger.error("SimulationWsManager.onclose", `Permanent close (code ${ev.code})`);
        this.setAuthState("auth_failed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelReconnect();
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.subscriptions.clear();
    this.buffers.clear();
    this.setAuthState("idle");
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Eagerly subscribe to a run BEFORE a UI consumer is ready to call
   * `subscribe()`. Sends `{type:"subscribe",runId}` to the server (or queues
   * it until `auth_ok`) and buffers all incoming events/frames for this run.
   * The buffer is drained the moment `subscribe()` is called for the same
   * runId.
   *
   * Per OpenAPI: "Subscribe can be sent before the simulation starts — this
   * eliminates the race condition." Call this immediately after
   * `POST /simulations/...` returns the runId, before navigating to the
   * live-run page.
   */
  prepareRun(runId: string): void {
    if (this.subscriptions.has(runId) || this.buffers.has(runId)) return;
    // Drop any stale prepared runs — only one launch at a time has a UI
    // consumer waiting. Stale buffers from abandoned launches just leak memory.
    for (const staleId of this.buffers.keys()) {
      if (this.authState === "auth_ok") {
        this.send({ type: "unsubscribe", runId: staleId });
      }
    }
    this.buffers.clear();

    this.buffers.set(runId, { events: [], binaries: [] });
    if (this.authState === "auth_ok") {
      this.send({ type: "subscribe", runId });
    }
    // If not yet auth_ok, resubscribeAll() will pick this up on auth_ok.
  }

  subscribe(runId: string, onEvent: WsEventCallback, onBinary: WsBinaryCallback): void {
    this.subscriptions.set(runId, { onEvent, onBinary });

    const buffer = this.buffers.get(runId);
    if (buffer) {
      for (const ev of buffer.events) onEvent(ev);
      for (const buf of buffer.binaries) onBinary(buf);
      this.buffers.delete(runId);
    } else if (this.authState === "auth_ok") {
      this.send({ type: "subscribe", runId });
    }
    // If not yet auth_ok and no buffer, resubscribeAll() runs on auth_ok.
  }

  unsubscribe(runId: string): void {
    const hadSub = this.subscriptions.delete(runId);
    const hadBuffer = this.buffers.delete(runId);
    if ((hadSub || hadBuffer) && this.authState === "auth_ok") {
      this.send({ type: "unsubscribe", runId });
    }
  }

  // ─── Private: auth & message handling ──────────────────────────────────────

  private async sendAuth(): Promise<void> {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        logger.error("SimulationWsManager.sendAuth", "No Firebase user — cannot authenticate WS");
        this.setAuthState("auth_failed");
        return;
      }
      this.send({ type: "auth", token });
    } catch (err) {
      logger.error("SimulationWsManager.sendAuth", err);
      this.setAuthState("auth_failed");
    }
  }

  private handleTextMessage(msg: ServerControlMessage): void {
    if ("type" in msg) {
      if (msg.type === "auth_ok") {
        this.reconnectAttempts = 0;
        this.setAuthState("auth_ok");
        this.resubscribeAll();
        return;
      }
      if (msg.type === "error") {
        logger.error("SimulationWsManager.server", `Server error: ${msg.code}`);
        if (msg.code === "auth_failed") {
          this.setAuthState("auth_failed");
        }
        return;
      }
    }

    // WsControlEvent — route to the matching subscription, or buffer it for
    // a prepared run that has no consumer yet.
    const wsEvent = msg as WsControlEvent;
    const runId = "runId" in wsEvent ? wsEvent.runId : null;
    if (runId) {
      const sub = this.subscriptions.get(runId);
      if (sub) {
        sub.onEvent(wsEvent);
      } else {
        const buf = this.buffers.get(runId);
        if (buf) buf.events.push(wsEvent);
      }
    } else {
      // Broadcast to all (e.g. future global events)
      for (const sub of this.subscriptions.values()) sub.onEvent(wsEvent);
    }
  }

  private resubscribeAll(): void {
    for (const runId of this.subscriptions.keys()) {
      this.send({ type: "subscribe", runId });
    }
    for (const runId of this.buffers.keys()) {
      this.send({ type: "subscribe", runId });
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ─── Reconnect ─────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        "SimulationWsManager.reconnect",
        `Giving up after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      );
      this.setAuthState("auth_failed");
      return;
    }

    this.setAuthState("reconnecting");
    const delay = RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) => {
        logger.error("SimulationWsManager.reconnect", err);
      });
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
