import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import { TOPOLOGY_RETRY_BASE_MS } from "./topology-fetch";
import type { TopologyColumns, TopologyWorkerResponse } from "./topology-transfer";

// The worker registers `self.onmessage` at import and keeps module state (token, started flag):
// like simulation-frame.worker.test.ts, every test re-imports it from a fresh module registry.

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = "http://api.test/api";

function topologyOf(agentCount: number, edgeCount: number): TopologyResponse {
  return {
    runId: "run-1",
    networkId: "net-1",
    agentCount,
    edgeCount,
    agentOffset: 0,
    agentLimit: agentCount,
    edgeOffset: 0,
    edgeLimit: edgeCount,
    agents: Array.from({ length: agentCount }, (_, i) => ({
      index: i,
      name: null,
      initialBelief: 0.5,
      toleranceRadius: 0.1,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    })),
    edges: Array.from({ length: edgeCount }, (_, j) => ({
      source: (j + 1) % agentCount,
      target: j % agentCount,
      influence: 0.25,
      bias: 1,
    })),
  };
}

/** The JSON text of a page of `topology` (windows clipped like the backend, capped at `cap`). */
function pageText(topology: TopologyResponse, url: string, cap = Number.POSITIVE_INFINITY): string {
  const q = new URL(url).searchParams;
  const n = (key: string) => Number(q.get(key));
  const slice = <T>(items: T[], offset: number, limit: number) =>
    items.slice(offset, offset + Math.min(limit, cap));
  return JSON.stringify({
    ...topology,
    agentOffset: n("agentOffset"),
    agentLimit: n("agentLimit"),
    edgeOffset: n("edgeOffset"),
    edgeLimit: n("edgeLimit"),
    agents: slice(topology.agents, n("agentOffset"), n("agentLimit")),
    edges: slice(topology.edges, n("edgeOffset"), n("edgeLimit")),
  });
}

const response = (status: number, text = "") =>
  ({ status, text: async () => text }) as unknown as Response;

type FetchCall = { url: string; auth: string | undefined; signal: AbortSignal | undefined };

/** Stubs `fetch`; `respond` gets each call (with its index) and returns the response. */
function stubFetch(respond: (call: FetchCall, index: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call = { url, auth: headers.Authorization, signal: init?.signal ?? undefined };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

async function loadWorker(): Promise<void> {
  vi.resetModules();
  await import("./topology-fetch.worker");
}

function dispatch(data: unknown): void {
  const handler = self.onmessage as ((event: MessageEvent) => void) | null;
  if (!handler) throw new Error("worker did not register self.onmessage");
  handler({ data } as MessageEvent);
}

function startLoad(token: string | null = "tok-1", baseUrl = BASE): void {
  dispatch({ type: "load", baseUrl, runId: "run-1", networkId: "net-1", token });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("topology-fetch.worker", () => {
  let posted: { message: TopologyWorkerResponse; transfer: Transferable[] }[];

  beforeEach(() => {
    posted = [];
    vi.spyOn(self, "postMessage").mockImplementation(((
      message: TopologyWorkerResponse,
      transfer?: Transferable[],
    ) => {
      posted.push({ message, transfer: transfer ?? [] });
    }) as typeof self.postMessage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const messages = () => posted.map((p) => p.message);
  const tokenRequest = () =>
    vi.waitFor(() => {
      const found = messages().find((m) => m.type === "token-request");
      if (found === undefined) throw new Error("no token request yet");
      return found as { requestId: number };
    });
  const outcome = () =>
    vi.waitFor(() => {
      const last = messages().find(
        (m) => m.type === "done" || m.type === "error" || m.type === "not-ready",
      );
      if (last === undefined) throw new Error("no outcome yet");
      return last;
    });

  it("downloads the pages with the token and transfers the columns in one message", async () => {
    const topology = topologyOf(3, 2);
    const { calls } = stubFetch((call) => response(200, pageText(topology, call.url)));
    await loadWorker();
    startLoad();

    const done = await outcome();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `${BASE}/simulations/run-1/networks/net-1/topology?agentOffset=0&agentLimit=10000&edgeOffset=0&edgeLimit=100000`,
    );
    expect(calls[0]?.auth).toBe("Bearer tok-1");
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);

    expect(messages().map((m) => m.type)).toEqual(["progress", "page", "progress", "done"]);
    expect(messages()[2]).toEqual({
      type: "progress",
      progress: { stage: "download", pagesDone: 1, pagesTotal: 1 },
    });
    const columns = (done as { columns: TopologyColumns }).columns;
    expect(Array.from(columns.edges.source)).toEqual([1, 2]);
    expect(columns.meta).toMatchObject({ runId: "run-1", agentCount: 3, edgeCount: 2 });
    // the nine column buffers travel in the transfer list — not one message per agent
    expect(posted[posted.length - 1]?.transfer).toHaveLength(9);
  });

  it("joins the base URL without a double slash and sends no Authorization without a token", async () => {
    const topology = topologyOf(2, 1);
    const { calls } = stubFetch((call) => response(200, pageText(topology, call.url)));
    await loadWorker();
    startLoad(null, `${BASE}/`);

    await outcome();
    expect(calls[0]?.url.startsWith(`${BASE}/simulations/`)).toBe(true);
    expect(calls[0]?.auth).toBeUndefined();
  });

  it("asks the main thread for a refreshed token on 401 and retries the page once with it", async () => {
    const topology = topologyOf(2, 1);
    const { calls } = stubFetch((call) =>
      call.auth === "Bearer tok-1" ? response(401) : response(200, pageText(topology, call.url)),
    );
    await loadWorker();
    startLoad("tok-1");

    const request = await tokenRequest();
    dispatch({ type: "token", requestId: request.requestId, token: "tok-2" });

    expect((await outcome()).type).toBe("done");
    expect(calls.map((c) => c.auth)).toEqual(["Bearer tok-1", "Bearer tok-2"]);
  });

  it("fails the page on a second 401 (refresh once, like the axios interceptor)", async () => {
    stubFetch(() => response(401));
    await loadWorker();
    startLoad("tok-1");

    const request = await tokenRequest();
    dispatch({ type: "token", requestId: request.requestId, token: null });

    expect(await outcome()).toEqual({
      type: "error",
      error: { kind: "http", status: 401, attempts: 1, message: "topology page answered 401" },
    });
  });

  it("uses the refreshed token for the pages that follow", async () => {
    const topology = topologyOf(12, 0);
    const { calls } = stubFetch((call) =>
      call.auth === "Bearer old" ? response(401) : response(200, pageText(topology, call.url, 2)),
    );
    await loadWorker();
    startLoad("old");

    // First page: 401 → refresh → retry; then 5 agent pages of 2 agents with the fresh token
    const first = await tokenRequest();
    dispatch({ type: "token", requestId: first.requestId, token: "new" });

    expect((await outcome()).type).toBe("done");
    expect(messages().filter((m) => m.type === "token-request")).toHaveLength(1);
    expect(calls).toHaveLength(7);
    expect(calls.slice(1).every((c) => c.auth === "Bearer new")).toBe(true);
  });

  it("shares one refresh between pages sent with the old token, whenever their 401 arrives", async () => {
    // 6 agents in pages of 2: the first page, then pages at 2 (A) and 4 (B), both sent with
    // the old token. A's 401 refreshes; B's 401 arrives during the refresh (C, at 6) or after it
    // (B): neither asks for another token.
    const topology = topologyOf(8, 0);
    let releaseLate!: () => void;
    const late = new Promise<void>((resolve) => {
      releaseLate = resolve;
    });
    const { calls } = stubFetch(async (call, index) => {
      if (index === 0 || call.auth !== "Bearer old") {
        return response(200, pageText(topology, call.url, 2));
      }
      if (call.url.includes("agentOffset=4")) await late;
      return response(401);
    });
    await loadWorker();
    startLoad("old");

    const request = await tokenRequest();
    dispatch({ type: "token", requestId: request.requestId, token: "new" });
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.auth === "Bearer new").length).toBeGreaterThanOrEqual(2),
    );
    releaseLate();

    expect((await outcome()).type).toBe("done");
    expect(messages().filter((m) => m.type === "token-request")).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("agentOffset=4")).map((c) => c.auth)).toEqual([
      "Bearer old",
      "Bearer new",
    ]);
  });

  it("reports a non-retryable status at once", async () => {
    stubFetch(() => response(403));
    await loadWorker();
    startLoad();
    expect(await outcome()).toMatchObject({
      type: "error",
      error: { kind: "http", status: 403, attempts: 1 },
    });
  });

  it("posts not-ready when the first page answers 202", async () => {
    stubFetch(() => response(202, '{"error":"not_ready"}'));
    await loadWorker();
    startLoad();
    expect(await outcome()).toEqual({ type: "not-ready" });
  });

  it("retries a malformed page and a network error with backoff, then completes", async () => {
    vi.useFakeTimers();
    const topology = topologyOf(2, 1);
    stubFetch((call, index) => {
      if (index === 0) return response(200, "{ truncated");
      if (index === 1) throw new TypeError("Failed to fetch");
      return response(200, pageText(topology, call.url));
    });
    await loadWorker();
    startLoad();
    await vi.advanceTimersByTimeAsync(TOPOLOGY_RETRY_BASE_MS * 3);
    expect((await outcome()).type).toBe("done");
  });

  it("reports a retryable failure once its retries are exhausted", async () => {
    vi.useFakeTimers();
    stubFetch(() => response(503));
    await loadWorker();
    startLoad();
    await vi.advanceTimersByTimeAsync(TOPOLOGY_RETRY_BASE_MS * 8);
    expect(await outcome()).toMatchObject({
      type: "error",
      error: { kind: "http", status: 503, attempts: 4 },
    });
  });

  it("reports an unexpected failure as a worker error", async () => {
    const topology = topologyOf(2, 1);
    stubFetch((call) => response(200, pageText(topology, call.url)));
    vi.mocked(self.postMessage).mockImplementation(((message: TopologyWorkerResponse) => {
      if (message.type === "done") throw new Error("DataCloneError");
      posted.push({ message, transfer: [] });
    }) as typeof self.postMessage);
    await loadWorker();
    startLoad();
    expect(await outcome()).toEqual({
      type: "error",
      error: { kind: "worker", status: null, attempts: 1, message: "DataCloneError" },
    });
  });

  it("runs one load per worker and ignores answers to unknown token requests", async () => {
    const topology = topologyOf(2, 1);
    const { calls } = stubFetch((call) => response(200, pageText(topology, call.url)));
    await loadWorker();
    startLoad();
    startLoad();
    dispatch({ type: "token", requestId: 99, token: "x" });
    await outcome();
    expect(calls).toHaveLength(1);
  });
});
