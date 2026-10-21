import type { TopologyParams } from "@/shared/api/backend/types/backend.types";
import {
  type TopologyColumns,
  TopologyLoadError,
  type TopologyLoadErrorKind,
  type TopologyLoadProgress,
  type TopologyMeta,
} from "./topology-transfer";

/**
 * Paged download of a full topology (#128), environment-agnostic: the topology worker runs it
 * with `fetch`, tests with a fake `fetchPage`.
 *
 * - The first page asks for large page sizes; the remaining pages follow its counts, at most
 *   {@link TOPOLOGY_PAGE_CONCURRENCY} at a time.
 * - A failed page is retried up to {@link TOPOLOGY_PAGE_RETRIES} times with exponential backoff
 *   when the failure can be transient (network error, 5xx, 408, 429, a malformed page). If it
 *   still fails, the WHOLE download fails: the remaining pages are aborted and nothing is
 *   returned. A topology is never returned with a page missing.
 * - Each page is validated (counts, item windows, value types) before it is written into the
 *   columns, and the agents are checked for completeness at the end.
 * - Only the item kind a page was asked for is read from it (agents of an agent page, edges of
 *   an edge page, both from the first page), which keeps the download robust to a server that
 *   ignores a `*Limit: 0` hint: those extra items repeat the first page's.
 */

export type TopologyPageRequest = Required<TopologyParams>;

/** First page: aggressively large sizes; its item counts set the page size of the others. */
export const FIRST_TOPOLOGY_PAGE: TopologyPageRequest = {
  agentOffset: 0,
  agentLimit: 10_000,
  edgeOffset: 0,
  edgeLimit: 100_000,
};

/** Retries of a failed page (attempts = 1 + retries). */
export const TOPOLOGY_PAGE_RETRIES = 3;

/** Backoff before retry n (0-based): `TOPOLOGY_RETRY_BASE_MS · 2ⁿ` — 0.5 s, 1 s, 2 s. */
export const TOPOLOGY_RETRY_BASE_MS = 500;

/** Pages in flight at once (the HTTP/1.1 per-origin connection limit of browsers). */
export const TOPOLOGY_PAGE_CONCURRENCY = 6;

/** One page as `fetchPage` delivers it: the parsed JSON body, or 202 "not ready". */
export type TopologyPageResponse =
  | { status: 200; body: unknown; parseMs: number }
  | { status: 202 };

/** A failed page attempt; `retryable` says whether another attempt can help. */
export class TopologyPageError extends Error {
  readonly kind: Exclude<TopologyLoadErrorKind, "worker">;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    kind: Exclude<TopologyLoadErrorKind, "worker">,
    message: string,
    options: { status?: number | null; retryable: boolean },
  ) {
    super(message);
    this.name = "TopologyPageError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable;
  }
}

/** Statuses worth another attempt: server errors, request timeout, rate limiting. */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export interface FetchTopologyOptions {
  /** Fetches and parses one page; throws a TopologyPageError (or any error = network error). */
  fetchPage: (request: TopologyPageRequest, signal: AbortSignal) => Promise<TopologyPageResponse>;
  onProgress?: (progress: TopologyLoadProgress) => void;
  /** Called for each page that arrived (its JSON parse time), retries included. */
  onPage?: (page: { parseMs: number }) => void;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  retryBaseMs?: number;
  concurrency?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Validation helpers ──────────────────────────────────────────────────────

const INT32_MAX = 0x7fff_ffff;

function invalid(message: string): TopologyPageError {
  return new TopologyPageError("invalid", message, { retryable: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isInt32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= INT32_MAX;
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

/** A float field: a number, or the backend's `null` for NaN/Infinity. */
function isFloatOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

/** null → NaN in a Float64 column (see topology-transfer). */
function floatCell(value: number | null): number {
  return value === null ? Number.NaN : value;
}

interface PageBody {
  meta: TopologyMeta;
  agentCount: number;
  edgeCount: number;
  agents: unknown[];
  edges: unknown[];
}

function readPage(body: unknown): PageBody {
  if (!isRecord(body)) throw invalid("topology page is not an object");
  const { agents, edges, ...meta } = body;
  if (!Array.isArray(agents) || !Array.isArray(edges)) {
    throw invalid("topology page has no agents/edges arrays");
  }
  if (!isCount(meta.agentCount) || !isCount(meta.edgeCount)) {
    throw invalid("topology page has no agent/edge counts");
  }
  return {
    meta: meta as unknown as TopologyMeta,
    agentCount: meta.agentCount,
    edgeCount: meta.edgeCount,
    agents,
    edges,
  };
}

// ─── Assembly ────────────────────────────────────────────────────────────────

/** Typed columns of one topology, written page by page. */
class TopologyAssembler {
  private readonly columns: TopologyColumns;
  private readonly filled: Uint8Array;
  private filledCount = 0;

  constructor(
    meta: TopologyMeta,
    readonly agentCount: number,
    readonly edgeCount: number,
  ) {
    this.columns = {
      meta,
      agents: {
        initialBelief: new Float64Array(agentCount),
        toleranceRadius: new Float64Array(agentCount),
        toleranceOffset: new Float64Array(agentCount),
        silenceStrategy: new Uint8Array(agentCount),
        silenceEffect: new Uint8Array(agentCount),
        names: null,
      },
      edges: {
        source: new Int32Array(edgeCount),
        target: new Int32Array(edgeCount),
        influence: new Float64Array(edgeCount),
        bias: new Uint8Array(edgeCount),
      },
    };
    this.filled = new Uint8Array(agentCount);
  }

  /** Agents of the window [from, from + expected): validated as a whole, then written. */
  writeAgents(items: unknown[], from: number, expected: number): void {
    if (items.length !== expected) {
      throw invalid(`agent page at ${from}: ${items.length} agents, expected ${expected}`);
    }
    const to = from + expected;
    for (const item of items) {
      if (
        !isRecord(item) ||
        !isCount(item.index) ||
        item.index < from ||
        item.index >= to ||
        !(item.name === null || typeof item.name === "string") ||
        !isFloatOrNull(item.initialBelief) ||
        !isFloatOrNull(item.toleranceRadius) ||
        !isFloatOrNull(item.toleranceOffset) ||
        !isByte(item.silenceStrategy) ||
        !isByte(item.silenceEffect)
      ) {
        throw invalid(`agent page at ${from}: malformed agent`);
      }
    }
    const a = this.columns.agents;
    for (const item of items as Record<string, unknown>[]) {
      const i = item.index as number;
      a.initialBelief[i] = floatCell(item.initialBelief as number | null);
      a.toleranceRadius[i] = floatCell(item.toleranceRadius as number | null);
      a.toleranceOffset[i] = floatCell(item.toleranceOffset as number | null);
      a.silenceStrategy[i] = item.silenceStrategy as number;
      a.silenceEffect[i] = item.silenceEffect as number;
      const name = item.name as string | null;
      if (name !== null || a.names !== null) {
        a.names ??= new Array<string | null>(this.agentCount).fill(null);
        a.names[i] = name;
      }
      if (this.filled[i] === 0) {
        this.filled[i] = 1;
        this.filledCount++;
      }
    }
  }

  /** Edges of the window [from, from + expected), at their positions. */
  writeEdges(items: unknown[], from: number, expected: number): void {
    if (items.length !== expected) {
      throw invalid(`edge page at ${from}: ${items.length} edges, expected ${expected}`);
    }
    for (const item of items) {
      if (
        !isRecord(item) ||
        !isInt32(item.source) ||
        !isInt32(item.target) ||
        !isFloatOrNull(item.influence) ||
        !isByte(item.bias)
      ) {
        throw invalid(`edge page at ${from}: malformed edge`);
      }
    }
    const e = this.columns.edges;
    let k = from;
    for (const item of items as Record<string, unknown>[]) {
      e.source[k] = item.source as number;
      e.target[k] = item.target as number;
      e.influence[k] = floatCell(item.influence as number | null);
      e.bias[k] = item.bias as number;
      k++;
    }
  }

  finish(): TopologyColumns {
    if (this.filledCount !== this.agentCount) {
      throw new TopologyLoadError({
        kind: "invalid",
        status: null,
        attempts: 1,
        message: `topology has ${this.filledCount} of ${this.agentCount} agents`,
      });
    }
    return this.columns;
  }
}

// ─── Page plan ───────────────────────────────────────────────────────────────

/** The pages after the first one; the first page's item counts are the page sizes. */
export function planRemainingPages(
  agentCount: number,
  edgeCount: number,
  agentStep: number,
  edgeStep: number,
): TopologyPageRequest[] {
  const pages: TopologyPageRequest[] = [];
  if (agentStep > 0) {
    for (let offset = agentStep; offset < agentCount; offset += agentStep) {
      pages.push({ agentOffset: offset, agentLimit: agentStep, edgeOffset: 0, edgeLimit: 0 });
    }
  }
  if (edgeStep > 0) {
    for (let offset = edgeStep; offset < edgeCount; offset += edgeStep) {
      pages.push({ agentOffset: 0, agentLimit: 0, edgeOffset: offset, edgeLimit: edgeStep });
    }
  }
  return pages;
}

/** Items a page must hold: its window clipped to the count. */
function expectedItems(offset: number, limit: number, count: number): number {
  return Math.max(0, Math.min(limit, count - offset));
}

// ─── Download ────────────────────────────────────────────────────────────────

function toPageError(error: unknown): TopologyPageError {
  if (error instanceof TopologyPageError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TopologyPageError("network", message, { retryable: true });
}

function toLoadError(error: TopologyPageError, attempts: number): TopologyLoadError {
  return new TopologyLoadError({
    kind: error.kind,
    status: error.status,
    attempts,
    message: error.message,
  });
}

/**
 * Downloads every page of a topology into columns. Resolves null when the first page answers
 * 202 (not ready); rejects with a {@link TopologyLoadError} when a page still fails after its
 * retries — never with part of the topology.
 */
export async function fetchTopologyColumns(
  options: FetchTopologyOptions,
): Promise<TopologyColumns | null> {
  const {
    fetchPage,
    onProgress,
    onPage,
    sleep = defaultSleep,
    retries = TOPOLOGY_PAGE_RETRIES,
    retryBaseMs = TOPOLOGY_RETRY_BASE_MS,
    concurrency = TOPOLOGY_PAGE_CONCURRENCY,
  } = options;
  const controller = new AbortController();

  /** Runs `attempt` (fetch + validate + write) with the retry policy. */
  const withRetries = async <T>(attempt: () => Promise<T>): Promise<T> => {
    for (let n = 0; ; n++) {
      try {
        return await attempt();
      } catch (error) {
        const failure = toPageError(error);
        if (!failure.retryable || n >= retries || controller.signal.aborted) {
          throw toLoadError(failure, n + 1);
        }
        await sleep(retryBaseMs * 2 ** n);
        if (controller.signal.aborted) throw toLoadError(failure, n + 1);
      }
    }
  };

  const fetchBody = async (request: TopologyPageRequest): Promise<PageBody | null> => {
    const response = await fetchPage(request, controller.signal);
    if (response.status === 202) return null;
    onPage?.({ parseMs: response.parseMs });
    return readPage(response.body);
  };

  onProgress?.({ stage: "download", pagesDone: 0, pagesTotal: null });

  const first = await withRetries(async () => {
    const page = await fetchBody(FIRST_TOPOLOGY_PAGE);
    if (page === null) return null;
    const { agentCount, edgeCount, agents, edges } = page;
    if (agents.length > agentCount || edges.length > edgeCount) {
      throw invalid("first topology page holds more items than its counts");
    }
    if ((agents.length === 0 && agentCount > 0) || (edges.length === 0 && edgeCount > 0)) {
      throw invalid("first topology page is empty");
    }
    const assembler = new TopologyAssembler(page.meta, agentCount, edgeCount);
    assembler.writeAgents(agents, 0, agents.length);
    assembler.writeEdges(edges, 0, edges.length);
    // The first page's item counts are the server's effective page sizes.
    return { assembler, agentStep: agents.length, edgeStep: edges.length };
  });
  if (first === null) return null;
  const columns = first.assembler;

  const plan = planRemainingPages(
    columns.agentCount,
    columns.edgeCount,
    first.agentStep,
    first.edgeStep,
  );
  const pagesTotal = 1 + plan.length;
  let pagesDone = 1;
  onProgress?.({ stage: "download", pagesDone, pagesTotal });

  const runPage = (request: TopologyPageRequest) =>
    withRetries(async () => {
      const page = await fetchBody(request);
      if (page === null) {
        throw new TopologyPageError("not-ready", "topology page answered 202 mid-download", {
          status: 202,
          retryable: true,
        });
      }
      if (page.agentCount !== columns.agentCount || page.edgeCount !== columns.edgeCount) {
        throw invalid("topology counts changed during the download");
      }
      if (request.agentLimit > 0) {
        const expected = expectedItems(request.agentOffset, request.agentLimit, page.agentCount);
        columns.writeAgents(page.agents, request.agentOffset, expected);
      }
      if (request.edgeLimit > 0) {
        const expected = expectedItems(request.edgeOffset, request.edgeLimit, page.edgeCount);
        columns.writeEdges(page.edges, request.edgeOffset, expected);
      }
    });

  await new Promise<void>((resolve, reject) => {
    let next = 0;
    let active = 0;
    let failed = false;
    const launch = () => {
      while (!failed && active < concurrency && next < plan.length) {
        const request = plan[next++] as TopologyPageRequest;
        active++;
        runPage(request).then(
          () => {
            active--;
            pagesDone++;
            onProgress?.({ stage: "download", pagesDone, pagesTotal });
            if (next >= plan.length && active === 0) resolve();
            else launch();
          },
          (error: unknown) => {
            if (failed) return;
            failed = true;
            // The download failed as a whole: stop the pages still in flight.
            controller.abort();
            reject(error);
          },
        );
      }
    };
    if (plan.length === 0) resolve();
    else launch();
  });

  return columns.finish();
}
