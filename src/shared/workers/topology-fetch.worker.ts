/// <reference lib="webworker" />
import {
  fetchTopologyColumns,
  isRetryableStatus,
  TopologyPageError,
  type TopologyPageRequest,
  type TopologyPageResponse,
} from "./topology-fetch";
import {
  columnsTransferList,
  TopologyLoadError,
  type TopologyLoadErrorInfo,
  type TopologyResourceEntry,
  type TopologyWorkerRequest,
  type TopologyWorkerResponse,
} from "./topology-transfer";

/**
 * Topology worker (#128): downloads, parses and merges the pages of one full topology off the
 * main thread, then transfers it as typed columns in a single message. One worker per download;
 * the main thread terminates it once the outcome arrives.
 *
 * Auth: the main thread passes a fresh Firebase ID token with `load` (never persisted: it lives in
 * this worker's memory only). A page that gets 401 asks the main thread for a force-refreshed
 * token and is retried once with it — the axios interceptor's refresh-once behaviour; a second
 * 401 fails the page. Concurrent 401s share one refresh.
 *
 * Imports stay type-only towards `shared/api`: a value import would pull axios and Firebase into
 * the worker chunk.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

let token: string | null = null;
let started = false;
let nextTokenRequestId = 1;
const tokenWaiters = new Map<number, (token: string | null) => void>();
let refreshing: Promise<string | null> | null = null;

function post(message: TopologyWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

/** A force-refreshed token from the main thread; concurrent callers share one request. */
function refreshToken(): Promise<string | null> {
  refreshing ??= new Promise<string | null>((resolve) => {
    const requestId = nextTokenRequestId++;
    tokenWaiters.set(requestId, resolve);
    post({ type: "token-request", requestId });
  }).then((fresh) => {
    token = fresh;
    refreshing = null;
    return fresh;
  });
  return refreshing;
}

function pageUrl(
  baseUrl: string,
  runId: string,
  networkId: string,
  request: TopologyPageRequest,
): string {
  // Same URL and parameter order as the axios requests (Resource Timing filters on the path).
  const params = new URLSearchParams({
    agentOffset: String(request.agentOffset),
    agentLimit: String(request.agentLimit),
    edgeOffset: String(request.edgeOffset),
    edgeLimit: String(request.edgeLimit),
  });
  // Trailing slashes trimmed with a loop (a `/\/+$/` regex backtracks super-linearly, Sonar S8786).
  let base = baseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/simulations/${runId}/networks/${networkId}/topology?${params.toString()}`;
}

async function get(url: string, bearer: string | null, signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json, text/plain, */*" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  try {
    return await fetch(url, { headers, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new TopologyPageError("network", `topology page request failed: ${message}`, {
      retryable: true,
    });
  }
}

function createFetchPage(baseUrl: string, runId: string, networkId: string) {
  return async (
    request: TopologyPageRequest,
    signal: AbortSignal,
  ): Promise<TopologyPageResponse> => {
    const url = pageUrl(baseUrl, runId, networkId, request);
    const used = token;
    let response = await get(url, used, signal);
    if (response.status === 401) {
      // Refresh once — unless another page already refreshed the token after this request left.
      const fresh = used !== token ? token : await refreshToken();
      response = await get(url, fresh, signal);
    }
    if (response.status === 202) return { status: 202 };
    if (response.status !== 200) {
      throw new TopologyPageError("http", `topology page answered ${response.status}`, {
        status: response.status,
        retryable: isRetryableStatus(response.status),
      });
    }
    const text = await response.text();
    const start = performance.now();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TopologyPageError("invalid", "topology page is not valid JSON", {
        status: 200,
        retryable: true,
      });
    }
    return { status: 200, body, parseMs: performance.now() - start };
  };
}

/** Bench builds only (#126): this worker's Resource Timing entries of the topology pages. */
function benchResources(): TopologyResourceEntry[] {
  try {
    const origin = performance.timeOrigin;
    return performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/topology"))
      .map((entry) => ({
        name: entry.name,
        startTime: origin + entry.startTime,
        responseEnd: origin + (entry as PerformanceResourceTiming).responseEnd,
      }));
  } catch {
    return [];
  }
}

async function load(request: Extract<TopologyWorkerRequest, { type: "load" }>): Promise<void> {
  token = request.token;
  try {
    const columns = await fetchTopologyColumns({
      fetchPage: createFetchPage(request.baseUrl, request.runId, request.networkId),
      onProgress: (progress) => post({ type: "progress", progress }),
      onPage: ({ parseMs }) => post({ type: "page", parseMs }),
    });
    if (columns === null) {
      post({ type: "not-ready" });
      return;
    }
    post(
      { type: "done", columns, ...(__BENCHMARK__ ? { resources: benchResources() } : {}) },
      columnsTransferList(columns),
    );
  } catch (error) {
    const info: TopologyLoadErrorInfo =
      error instanceof TopologyLoadError
        ? error.toInfo()
        : {
            kind: "worker",
            status: null,
            attempts: 1,
            message: error instanceof Error ? error.message : String(error),
          };
    post({ type: "error", error: info, ...(__BENCHMARK__ ? { resources: benchResources() } : {}) });
  }
}

scope.onmessage = (event: MessageEvent<TopologyWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "token") {
    const resolve = tokenWaiters.get(msg.requestId);
    tokenWaiters.delete(msg.requestId);
    resolve?.(msg.token);
    return;
  }
  if (msg.type === "load" && !started) {
    started = true;
    void load(msg);
  }
};
