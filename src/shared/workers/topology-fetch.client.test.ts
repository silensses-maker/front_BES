import { afterEach, describe, expect, it, vi } from "vitest";
import { createTopologyWorker, fetchTopologyInWorker } from "./topology-fetch.client";
import {
  type TopologyColumns,
  TopologyLoadError,
  type TopologyLoadProgress,
  type TopologyWorkerRequest,
  type TopologyWorkerResponse,
} from "./topology-transfer";

// ─── Fake worker ─────────────────────────────────────────────────────────────

class FakeWorker {
  onmessage: ((event: MessageEvent<TopologyWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly posted: TopologyWorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage(message: TopologyWorkerRequest): void {
    this.posted.push(message);
  }

  /** Delivers a message from the "worker". */
  emit(message: TopologyWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<TopologyWorkerResponse>);
  }
}

function columnsOf(agentCount: number, edgeCount: number): TopologyColumns {
  return {
    meta: {
      runId: "run-1",
      networkId: "net-1",
      agentCount,
      edgeCount,
      agentOffset: 0,
      agentLimit: 10_000,
      edgeOffset: 0,
      edgeLimit: 100_000,
    },
    agents: {
      initialBelief: new Float64Array(agentCount).fill(0.5),
      toleranceRadius: new Float64Array(agentCount).fill(0.1),
      toleranceOffset: new Float64Array(agentCount),
      silenceStrategy: new Uint8Array(agentCount),
      silenceEffect: new Uint8Array(agentCount),
      names: null,
    },
    edges: {
      source: Int32Array.from({ length: edgeCount }, (_, j) => (j + 1) % agentCount),
      target: Int32Array.from({ length: edgeCount }, (_, j) => j % agentCount),
      influence: new Float64Array(edgeCount).fill(0.25),
      bias: new Uint8Array(edgeCount).fill(1),
    },
  };
}

/** Starts a download against a fake worker; resolves once the worker got its `load`. */
async function start(overrides: Partial<Parameters<typeof fetchTopologyInWorker>[0]> = {}) {
  const worker = new FakeWorker();
  const getToken = vi.fn(async (force: boolean) => (force ? "fresh" : "first"));
  const progress: TopologyLoadProgress[] = [];
  const result = fetchTopologyInWorker({
    baseUrl: "http://api.test",
    runId: "run-1",
    networkId: "net-1",
    getToken,
    onProgress: (p) => progress.push(p),
    createWorker: () => worker as unknown as Worker,
    ...overrides,
  });
  await vi.waitFor(() => expect(worker.posted.length).toBeGreaterThan(0));
  return { worker, getToken, progress, result };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fetchTopologyInWorker", () => {
  it("starts the worker with a fresh token per download", async () => {
    const { worker, getToken } = await start();
    expect(getToken).toHaveBeenCalledWith(false);
    expect(worker.posted[0]).toEqual({
      type: "load",
      baseUrl: "http://api.test",
      runId: "run-1",
      networkId: "net-1",
      token: "first",
    });
  });

  it("forwards progress, then assembles the transferred columns into a TopologyResponse", async () => {
    const { worker, progress, result } = await start();
    worker.emit({
      type: "progress",
      progress: { stage: "download", pagesDone: 0, pagesTotal: null },
    });
    worker.emit({ type: "progress", progress: { stage: "download", pagesDone: 1, pagesTotal: 1 } });
    worker.emit({ type: "done", columns: columnsOf(2, 1) });

    const topology = await result;
    expect(topology?.agents).toHaveLength(2);
    expect(topology?.edges).toEqual([{ source: 1, target: 0, influence: 0.25, bias: 1 }]);
    expect(topology?.agentLimit).toBe(2);
    expect(progress).toEqual([
      { stage: "download", pagesDone: 0, pagesTotal: null },
      { stage: "download", pagesDone: 1, pagesTotal: 1 },
      { stage: "assemble" },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("answers a token request with a force-refreshed token", async () => {
    const { worker, getToken } = await start();
    worker.emit({ type: "token-request", requestId: 7 });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(getToken).toHaveBeenLastCalledWith(true);
    expect(worker.posted[1]).toEqual({ type: "token", requestId: 7, token: "fresh" });
  });

  it("answers null when the token refresh fails (the page then fails with its 401)", async () => {
    const getToken = vi.fn(async (force: boolean) => {
      if (force) throw new Error("auth/network-request-failed");
      return "first";
    });
    const { worker } = await start({ getToken });
    worker.emit({ type: "token-request", requestId: 1 });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(worker.posted[1]).toEqual({ type: "token", requestId: 1, token: null });
  });

  it("resolves null on not-ready (202) without assembling", async () => {
    const { worker, progress, result } = await start();
    worker.emit({ type: "not-ready" });
    expect(await result).toBeNull();
    expect(progress).toEqual([]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects with a TopologyLoadError when the download failed — no partial topology", async () => {
    const { worker, result } = await start();
    worker.emit({
      type: "progress",
      progress: { stage: "download", pagesDone: 3, pagesTotal: 15 },
    });
    worker.emit({
      type: "error",
      error: { kind: "http", status: 503, attempts: 4, message: "topology page answered 503" },
    });
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TopologyLoadError);
    expect(error).toMatchObject({ kind: "http", status: 503, attempts: 4 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects when the worker itself fails (script error, unreadable message)", async () => {
    const first = await start();
    const preventDefault = vi.fn();
    first.worker.onerror?.({ message: "", preventDefault } as unknown as ErrorEvent);
    await expect(first.result).rejects.toMatchObject({
      kind: "worker",
      message: "topology worker failed",
    });
    expect(preventDefault).toHaveBeenCalled();

    const second = await start();
    second.worker.onmessageerror?.();
    await expect(second.result).rejects.toMatchObject({ kind: "worker" });
    expect(second.worker.terminate).toHaveBeenCalledOnce();
  });

  it("propagates a failing initial token read without starting a worker", async () => {
    const createWorker = vi.fn();
    const result = fetchTopologyInWorker({
      baseUrl: "http://api.test",
      runId: "run-1",
      networkId: "net-1",
      getToken: async () => {
        throw new Error("auth/user-token-expired");
      },
      createWorker,
    });
    await expect(result).rejects.toThrow("auth/user-token-expired");
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("forwards page parse times and rebases the worker's resource entries (bench)", async () => {
    const onPage = vi.fn();
    const onResources = vi.fn();
    const { worker, result } = await start({ onPage, onResources });
    const origin = performance.timeOrigin;
    worker.emit({ type: "page", parseMs: 12 });
    worker.emit({
      type: "done",
      columns: columnsOf(1, 0),
      resources: [
        { name: "http://api.test/x/topology", startTime: origin + 5, responseEnd: origin + 9 },
      ],
    });
    await result;
    expect(onPage).toHaveBeenCalledWith({ parseMs: 12 });
    expect(onResources).toHaveBeenCalledWith([
      { name: "http://api.test/x/topology", startTime: 5, responseEnd: 9 },
    ]);
  });

  it("does not report empty resource lists", async () => {
    const onResources = vi.fn();
    const { worker, result } = await start({ onResources });
    worker.emit({
      type: "error",
      error: { kind: "network", status: null, attempts: 4, message: "offline" },
      resources: [],
    });
    await result.catch(() => {});
    expect(onResources).not.toHaveBeenCalled();
  });
});

describe("createTopologyWorker", () => {
  it("creates a named worker from the worker module", () => {
    const created: { url: unknown; options: unknown }[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: unknown, options: unknown) {
          created.push({ url, options });
        }
      },
    );
    createTopologyWorker();
    expect(String(created[0]?.url)).toContain("topology-fetch.worker");
    expect(created[0]?.options).toEqual({ name: "topology-worker" });
  });
});
