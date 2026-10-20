import type {
  CognitiveBias,
  SilenceEffect,
  SilenceStrategy,
  TopologyAgent,
  TopologyEdge,
  TopologyResponse,
} from "@/shared/api/backend/types/backend.types";

/**
 * What the topology worker (#128) hands back to the main thread, and how the main thread turns it
 * into the `TopologyResponse` the views use.
 *
 * Profiling at 100k agents / 600k edges (#128) showed that a structured clone of the merged
 * `{ agents, edges }` objects costs a ~270 ms long task to deserialize on the receiving side, so
 * the worker sends the topology as typed columns instead (transferred, zero-copy, one message)
 * and the main thread rebuilds the objects in short slices ({@link hydrateTopology}).
 *
 * Float columns are Float64 so every value round-trips exactly as JSON gave it. The backend
 * writes NaN/Infinity floats as JSON `null`; a column stores such a `null` as NaN (JSON itself has
 * no NaN) and hydration turns it back into `null`, so the objects match the parsed JSON.
 *
 * Why the worker stops at plain columns and does not build Cosmograph's Arrow tables:
 * `prepareCosmographData` (Cosmograph 2.3.2) stays on the main thread, with the objects
 * `topologyToData` makes. Spike #97 found that Cosmograph's pre-indexed Arrow path fails; and an
 * Arrow buffer handed to `prepareCosmographData` is still decoded (`tableFromIPC`) and encoded
 * again (`insertArrowTable` → `tableToIPC`) on the main thread, with column types chosen by our
 * builder instead of `tableFromJSON`'s inference — not proven to render identically. It would
 * also put apache-arrow in the worker chunk.
 */

// ─── Progress ────────────────────────────────────────────────────────────────

/** Progress of one topology download, as every consumer of that download sees it. */
export type TopologyLoadProgress =
  /** Pages downloaded and parsed; `pagesTotal` is null until the first page gave the counts. */
  | { stage: "download"; pagesDone: number; pagesTotal: number | null }
  /** Every page arrived: the topology objects are being assembled. */
  | { stage: "assemble" };

// ─── Columns ─────────────────────────────────────────────────────────────────

export interface TopologyAgentColumns {
  initialBelief: Float64Array;
  toleranceRadius: Float64Array;
  toleranceOffset: Float64Array;
  silenceStrategy: Uint8Array;
  silenceEffect: Uint8Array;
  /** `name` per agent index; null when every name is null (generated networks). */
  names: (string | null)[] | null;
}

export interface TopologyEdgeColumns {
  source: Int32Array;
  target: Int32Array;
  influence: Float64Array;
  bias: Uint8Array;
}

/** Top-level fields of the first page (runId, networkId, counts…), without the item arrays. */
export type TopologyMeta = Omit<TopologyResponse, "agents" | "edges">;

/** A complete topology in columns: agents by index, edges in the backend's (CSR) order. */
export interface TopologyColumns {
  meta: TopologyMeta;
  agents: TopologyAgentColumns;
  edges: TopologyEdgeColumns;
}

/** The buffers of `columns`, for the transfer list of the worker's `done` message. */
export function columnsTransferList(columns: TopologyColumns): ArrayBuffer[] {
  const { agents, edges } = columns;
  return [
    agents.initialBelief,
    agents.toleranceRadius,
    agents.toleranceOffset,
    agents.silenceStrategy,
    agents.silenceEffect,
    edges.source,
    edges.target,
    edges.influence,
    edges.bias,
  ].map((column) => column.buffer as ArrayBuffer);
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Why a topology download failed:
 * - `http`: an error status (after the retries, when it is a retryable one);
 * - `network`: the request itself failed (offline, CORS, connection reset…);
 * - `invalid`: a page that is not a well-formed page of this topology (bad JSON, missing or
 *   extra items, a count that changed);
 * - `not-ready`: a page after the first one answered 202 (the topology went away mid-download);
 * - `worker`: the worker could not run (script failed to load or crashed).
 */
export type TopologyLoadErrorKind = "http" | "network" | "invalid" | "not-ready" | "worker";

/** Structured-clone-safe description of a failed download (worker → main thread). */
export interface TopologyLoadErrorInfo {
  kind: TopologyLoadErrorKind;
  /** HTTP status of the failing page, when there was one. */
  status: number | null;
  /** Attempts made for the failing page (first try + retries). */
  attempts: number;
  message: string;
}

/** A topology download that failed as a whole: nothing of it is returned (#128). */
export class TopologyLoadError extends Error {
  readonly kind: TopologyLoadErrorKind;
  readonly status: number | null;
  readonly attempts: number;

  constructor(info: TopologyLoadErrorInfo) {
    super(info.message);
    this.name = "TopologyLoadError";
    this.kind = info.kind;
    this.status = info.status;
    this.attempts = info.attempts;
  }

  toInfo(): TopologyLoadErrorInfo {
    return { kind: this.kind, status: this.status, attempts: this.attempts, message: this.message };
  }
}

// ─── Worker protocol ─────────────────────────────────────────────────────────

/** Main thread → topology worker. */
export type TopologyWorkerRequest =
  | {
      type: "load";
      /** Absolute backend base URL (resolved on the main thread). */
      baseUrl: string;
      runId: string;
      networkId: string;
      /** Fresh Firebase ID token for this load; held in memory only, gone with the worker. */
      token: string | null;
    }
  /** Answer to a `token-request`: a force-refreshed token, or null when none could be had. */
  | { type: "token"; requestId: number; token: string | null };

/** Topology worker → main thread. */
export type TopologyWorkerResponse =
  | { type: "progress"; progress: TopologyLoadProgress }
  /** One page arrived; `parseMs` is its JSON.parse time in the worker (bench probe). */
  | { type: "page"; parseMs: number }
  /** A request got 401: the worker needs a force-refreshed token (axios interceptor semantics). */
  | { type: "token-request"; requestId: number }
  /** The first page answered 202: the topology is not ready yet. */
  | { type: "not-ready" }
  | {
      type: "done";
      columns: TopologyColumns;
      /**
       * Bench builds only (#126): the worker's Resource Timing entries of the topology pages.
       * Workers keep their own performance timeline, so the main thread would not see them.
       */
      resources?: TopologyResourceEntry[];
    }
  | { type: "error"; error: TopologyLoadErrorInfo; resources?: TopologyResourceEntry[] };

/**
 * A Resource Timing entry of a topology page (bench builds). In worker messages the times are
 * absolute (`performance.timeOrigin + t`); the client turns them into main-thread times.
 */
export interface TopologyResourceEntry {
  name: string;
  startTime: number;
  responseEnd: number;
}

// ─── Hydration ───────────────────────────────────────────────────────────────

/** Gives the main thread back between hydration slices (rendering, input). */
export type YieldToMain = () => Promise<void>;

interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

/** `scheduler.yield()` where available, otherwise a macrotask (not throttled like timers). */
export const yieldToMain: YieldToMain = () => {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
};

/** Main-thread time per hydration slice before yielding (ms): well under a 50 ms long task. */
export const HYDRATE_SLICE_MS = 8;

/** Items between two clock reads while hydrating. */
const CLOCK_EVERY = 4096;

/**
 * A column value as the JSON had it: NaN stands for a JSON `null` (see the module comment).
 * The types declare these fields as numbers; the parsed JSON could carry `null`, and so does
 * the hydrated object.
 */
function jsonFloat(value: number | undefined): number {
  return value === undefined || Number.isNaN(value) ? (null as unknown as number) : value;
}

/** Runs `body(0..count-1)` in slices of about `sliceMs`, yielding between slices. */
async function runSliced(
  count: number,
  body: (i: number) => void,
  yieldFn: YieldToMain,
  sliceMs: number,
): Promise<void> {
  let i = 0;
  while (i < count) {
    const deadline = performance.now() + sliceMs;
    do {
      const end = Math.min(count, i + CLOCK_EVERY);
      for (; i < end; i++) body(i);
    } while (i < count && performance.now() < deadline);
    if (i < count) await yieldFn();
  }
}

/**
 * Rebuilds the `TopologyResponse` objects from the columns in slices of
 * {@link HYDRATE_SLICE_MS}, yielding in between, so no single task blocks the main thread.
 * The result has the shape `getTopologyFull` always returned: agents sorted by index, edges in
 * the backend's order, offsets 0 and limits equal to the item counts.
 */
export async function hydrateTopology(
  columns: TopologyColumns,
  yieldFn: YieldToMain = yieldToMain,
  sliceMs: number = HYDRATE_SLICE_MS,
): Promise<TopologyResponse> {
  const { meta, agents: a, edges: e } = columns;

  const agents: TopologyAgent[] = [];
  await runSliced(
    a.initialBelief.length,
    (i) => {
      agents.push({
        index: i,
        name: a.names?.[i] ?? null,
        initialBelief: jsonFloat(a.initialBelief[i]),
        toleranceRadius: jsonFloat(a.toleranceRadius[i]),
        toleranceOffset: jsonFloat(a.toleranceOffset[i]),
        silenceStrategy: (a.silenceStrategy[i] ?? 0) as SilenceStrategy,
        silenceEffect: (a.silenceEffect[i] ?? 0) as SilenceEffect,
      });
    },
    yieldFn,
    sliceMs,
  );

  const edges: TopologyEdge[] = [];
  await runSliced(
    e.source.length,
    (j) => {
      edges.push({
        source: e.source[j] ?? 0,
        target: e.target[j] ?? 0,
        influence: jsonFloat(e.influence[j]),
        bias: (e.bias[j] ?? 0) as CognitiveBias,
      });
    },
    yieldFn,
    sliceMs,
  );

  return {
    ...meta,
    agentOffset: 0,
    agentLimit: agents.length,
    edgeOffset: 0,
    edgeLimit: edges.length,
    agents,
    edges,
  };
}
