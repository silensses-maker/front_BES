import type { TopologyResponse } from "@/shared/api/backend/types/backend.types";
import {
  hydrateTopology,
  type TopologyColumns,
  TopologyLoadError,
  type TopologyLoadProgress,
  type TopologyResourceEntry,
  type TopologyWorkerRequest,
  type TopologyWorkerResponse,
} from "./topology-transfer";

/**
 * Main-thread side of the topology worker (#128): starts one worker per download, answers its
 * token requests, forwards its progress and turns its columns back into a `TopologyResponse`
 * (in short slices, see `hydrateTopology`).
 */

export interface FetchTopologyInWorkerOptions {
  /** Absolute backend base URL. */
  baseUrl: string;
  runId: string;
  networkId: string;
  /** Firebase ID token; `forceRefresh` after a 401 (the axios interceptor's semantics). */
  getToken: (forceRefresh: boolean) => Promise<string | null>;
  onProgress?: (progress: TopologyLoadProgress) => void;
  /** Bench builds (#126): JSON parse time of each page, in the worker. */
  onPage?: (page: { parseMs: number }) => void;
  /** Bench builds (#126): the worker's Resource Timing entries, on the main-thread clock. */
  onResources?: (entries: TopologyResourceEntry[]) => void;
  /** Test seam: the worker to talk to. */
  createWorker?: () => Worker;
}

/**
 * The topology worker — a lazy chunk, loaded when the first download starts. Its `name` (the
 * thread name in DevTools, and the worker chunk's name) must differ from the client's chunk name
 * (`topology-fetch`): chunks that share a name are merged.
 */
export function createTopologyWorker(): Worker {
  return new Worker(new URL("./topology-fetch.worker.ts", import.meta.url), {
    name: "topology-worker",
  });
}

/** Worker times are absolute (`timeOrigin + t`): rebase them on this thread's time origin. */
function toLocalClock(entries: readonly TopologyResourceEntry[]): TopologyResourceEntry[] {
  const origin = performance.timeOrigin;
  return entries.map((entry) => ({
    name: entry.name,
    startTime: entry.startTime - origin,
    responseEnd: entry.responseEnd - origin,
  }));
}

/** Runs the worker until its outcome: columns, null (202), or a TopologyLoadError. */
function runWorker(
  worker: Worker,
  options: FetchTopologyInWorkerOptions,
  token: string | null,
): Promise<TopologyColumns | null> {
  return new Promise<TopologyColumns | null>((resolve, reject) => {
    const answerTokenRequest = (requestId: number) => {
      options
        .getToken(true)
        .catch(() => null)
        .then((fresh) => {
          const answer: TopologyWorkerRequest = { type: "token", requestId, token: fresh };
          worker.postMessage(answer);
        });
    };
    const reportResources = (entries: TopologyResourceEntry[] | undefined) => {
      if (entries !== undefined && entries.length > 0) options.onResources?.(toLocalClock(entries));
    };

    worker.onmessage = (event: MessageEvent<TopologyWorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case "progress":
          options.onProgress?.(msg.progress);
          break;
        case "page":
          options.onPage?.({ parseMs: msg.parseMs });
          break;
        case "token-request":
          answerTokenRequest(msg.requestId);
          break;
        case "not-ready":
          resolve(null);
          break;
        case "done":
          reportResources(msg.resources);
          resolve(msg.columns);
          break;
        case "error":
          reportResources(msg.resources);
          reject(new TopologyLoadError(msg.error));
          break;
      }
    };
    const failWorker = (message: string) =>
      reject(new TopologyLoadError({ kind: "worker", status: null, attempts: 1, message }));
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      failWorker(event.message || "topology worker failed");
    };
    worker.onmessageerror = () => failWorker("topology worker message could not be read");

    const start: TopologyWorkerRequest = {
      type: "load",
      baseUrl: options.baseUrl,
      runId: options.runId,
      networkId: options.networkId,
      token,
    };
    worker.postMessage(start);
  });
}

/**
 * Downloads a full topology in the topology worker. Resolves null on 202 (not ready); rejects
 * with a {@link TopologyLoadError} when the download fails — never with a partial topology.
 */
export async function fetchTopologyInWorker(
  options: FetchTopologyInWorkerOptions,
): Promise<TopologyResponse | null> {
  // A fresh token per download, read on the main thread (Firebase Auth lives here).
  const token = await options.getToken(false);
  const worker = (options.createWorker ?? createTopologyWorker)();
  let columns: TopologyColumns | null;
  try {
    columns = await runWorker(worker, options, token);
  } finally {
    worker.terminate();
  }
  if (columns === null) return null;
  options.onProgress?.({ stage: "assemble" });
  return hydrateTopology(columns);
}
