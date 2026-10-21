import { describe, expect, it, vi } from "vitest";
import type { TopologyAgent, TopologyEdge, TopologyResponse } from "@/shared/api/backend";
import {
  FIRST_TOPOLOGY_PAGE,
  fetchTopologyColumns,
  isRetryableStatus,
  planRemainingPages,
  TOPOLOGY_PAGE_CONCURRENCY,
  TOPOLOGY_PAGE_RETRIES,
  TOPOLOGY_RETRY_BASE_MS,
  TopologyPageError,
  type TopologyPageRequest,
  type TopologyPageResponse,
} from "./topology-fetch";
import { hydrateTopology, TopologyLoadError, type TopologyLoadProgress } from "./topology-transfer";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTopology(agentCount: number, edgeCount: number): TopologyResponse {
  const agents: TopologyAgent[] = Array.from({ length: agentCount }, (_, i) => ({
    index: i,
    name: null,
    initialBelief: (i % 97) / 97,
    toleranceRadius: 0.1,
    toleranceOffset: 0,
    silenceStrategy: (i % 4) as TopologyAgent["silenceStrategy"],
    silenceEffect: (i % 3) as TopologyAgent["silenceEffect"],
  }));
  const edges: TopologyEdge[] = Array.from({ length: edgeCount }, (_, j) => ({
    source: (j * 7 + 1) % agentCount,
    target: j % agentCount,
    influence: ((j % 13) + 1) / 14,
    bias: ((j % 2) + 1) as TopologyEdge["bias"],
  }));
  return {
    runId: "run-1",
    networkId: "net-1",
    agentCount,
    edgeCount,
    agentOffset: 0,
    agentLimit: agentCount,
    edgeOffset: 0,
    edgeLimit: edgeCount,
    agents,
    edges,
  };
}

/** A page of `topology` cut like the backend (`ApiJson.topologyPage`): windows clipped to counts. */
function pageOf(topology: TopologyResponse, request: TopologyPageRequest): TopologyResponse {
  const window = (offset: number, limit: number, count: number) => {
    const start = Math.min(Math.max(offset, 0), count);
    return [start, Math.max(start, Math.min(offset + Math.max(limit, 0), count))] as const;
  };
  const [aStart, aEnd] = window(request.agentOffset, request.agentLimit, topology.agentCount);
  const [eStart, eEnd] = window(request.edgeOffset, request.edgeLimit, topology.edgeCount);
  return {
    ...topology,
    ...request,
    // JSON round trip, like a real response (no shared object identity)
    agents: JSON.parse(JSON.stringify(topology.agents.slice(aStart, aEnd))),
    edges: JSON.parse(JSON.stringify(topology.edges.slice(eStart, eEnd))),
  };
}

type Fault = (request: TopologyPageRequest, attempt: number) => TopologyPageResponse | Error | null;

/** A fake paged server; `fault` may replace a response (attempt counts per page). */
function server(topology: TopologyResponse, fault?: Fault) {
  const attempts = new Map<string, number>();
  const requests: TopologyPageRequest[] = [];
  const signals: AbortSignal[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPage = vi.fn(async (request: TopologyPageRequest, signal: AbortSignal) => {
    requests.push(request);
    signals.push(signal);
    const key = JSON.stringify(request);
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    const injected = fault?.(request, attempt) ?? null;
    if (injected instanceof Error) throw injected;
    if (injected !== null) return injected;
    return { status: 200 as const, body: pageOf(topology, request), parseMs: 1 };
  });
  return {
    fetchPage,
    requests,
    signals,
    attemptsOf: (request: TopologyPageRequest) => attempts.get(JSON.stringify(request)) ?? 0,
    maxInFlight: () => maxInFlight,
  };
}

/** A server that echoes the requested limits but returns at most `cap` items of each kind. */
function cappedAt(topology: TopologyResponse, cap: number): Fault {
  return (request) => {
    const limited = {
      ...request,
      agentLimit: Math.min(request.agentLimit, cap),
      edgeLimit: Math.min(request.edgeLimit, cap),
    };
    return { status: 200, body: { ...pageOf(topology, limited), ...request }, parseMs: 0 };
  };
}

const noSleep = vi.fn(async (_ms: number) => {});

const isFirst = (r: TopologyPageRequest) =>
  r.agentLimit === FIRST_TOPOLOGY_PAGE.agentLimit &&
  r.edgeLimit > 0 &&
  r.agentOffset === 0 &&
  r.edgeOffset === 0;
const isEdgePage = (r: TopologyPageRequest, offset: number) =>
  r.agentLimit === 0 && r.edgeOffset === offset;

const http = (status: number) =>
  new TopologyPageError("http", `answered ${status}`, {
    status,
    retryable: isRetryableStatus(status),
  });

async function loadAll(topology: TopologyResponse, fault?: Fault) {
  const s = server(topology, fault);
  const progress: TopologyLoadProgress[] = [];
  const columns = await fetchTopologyColumns({
    fetchPage: s.fetchPage,
    sleep: noSleep,
    onProgress: (p) => progress.push(p),
  });
  return { s, progress, columns };
}

// ─── Plan ────────────────────────────────────────────────────────────────────

describe("planRemainingPages", () => {
  it("plans the agent pages, then the edge pages, after the first page's sizes", () => {
    expect(planRemainingPages(25, 7, 10, 3)).toEqual([
      { agentOffset: 10, agentLimit: 10, edgeOffset: 0, edgeLimit: 0 },
      { agentOffset: 20, agentLimit: 10, edgeOffset: 0, edgeLimit: 0 },
      { agentOffset: 0, agentLimit: 0, edgeOffset: 3, edgeLimit: 3 },
      { agentOffset: 0, agentLimit: 0, edgeOffset: 6, edgeLimit: 3 },
    ]);
  });

  it("plans nothing when the first page held everything (or a count is 0)", () => {
    expect(planRemainingPages(10, 0, 10, 0)).toEqual([]);
  });

  it("matches the old request plan at 100k agents / 600k edges (15 pages)", () => {
    const plan = planRemainingPages(100_000, 599_988, 10_000, 100_000);
    expect(plan).toHaveLength(14);
    expect(plan.filter((p) => p.agentLimit > 0)).toHaveLength(9);
    expect(plan[plan.length - 1]).toEqual({
      agentOffset: 0,
      agentLimit: 0,
      edgeOffset: 500_000,
      edgeLimit: 100_000,
    });
  });
});

describe("isRetryableStatus", () => {
  it.each([
    [500, true],
    [502, true],
    [503, true],
    [408, true],
    [429, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
  ])("%i → %s", (status, retryable) => {
    expect(isRetryableStatus(status)).toBe(retryable);
  });
});

// ─── Complete downloads ──────────────────────────────────────────────────────

describe("fetchTopologyColumns — complete downloads", () => {
  it("assembles every page into the same topology the old merge returned", async () => {
    // 25k agents / 250k edges: 3 agent pages and 3 edge pages after the first
    const topology = makeTopology(25_000, 250_000);
    const { s, columns } = await loadAll(topology);

    expect(s.requests[0]).toEqual(FIRST_TOPOLOGY_PAGE);
    expect(s.requests).toHaveLength(5);
    expect(columns).not.toBeNull();
    const hydrated = await hydrateTopology(columns!, async () => {});
    expect(hydrated).toEqual(topology);
  });

  it("downloads a small network in one page", async () => {
    const topology = makeTopology(50, 120);
    const { s, columns, progress } = await loadAll(topology);

    expect(s.requests).toEqual([FIRST_TOPOLOGY_PAGE]);
    expect(await hydrateTopology(columns!, async () => {})).toEqual(topology);
    expect(progress).toEqual([
      { stage: "download", pagesDone: 0, pagesTotal: null },
      { stage: "download", pagesDone: 1, pagesTotal: 1 },
    ]);
  });

  it("handles a network without edges", async () => {
    const topology = makeTopology(12, 0);
    const { columns } = await loadAll(topology);
    const hydrated = await hydrateTopology(columns!, async () => {});
    expect(hydrated.edges).toEqual([]);
    expect(hydrated.agents).toHaveLength(12);
  });

  it("reports the pages done out of the total, ending at total / total", async () => {
    const { progress } = await loadAll(makeTopology(25_000, 250_000));
    expect(progress[0]).toEqual({ stage: "download", pagesDone: 0, pagesTotal: null });
    expect(progress.slice(1).map((p) => (p.stage === "download" ? p.pagesDone : -1))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(progress[progress.length - 1]).toEqual({
      stage: "download",
      pagesDone: 5,
      pagesTotal: 5,
    });
  });

  it("follows the first page's sizes when the server caps them below the request", async () => {
    const topology = makeTopology(25, 30);
    const { s, columns } = await loadAll(topology, cappedAt(topology, 10));
    expect(s.requests.slice(1)).toEqual(planRemainingPages(25, 30, 10, 10));
    expect(await hydrateTopology(columns!, async () => {})).toEqual(topology);
  });

  it(`keeps at most ${TOPOLOGY_PAGE_CONCURRENCY} pages in flight`, async () => {
    // pages of 3 items: 1 + 9 agent pages + 13 edge pages
    const topology = makeTopology(30, 40);
    const { s, columns } = await loadAll(topology, cappedAt(topology, 3));
    expect(s.requests).toHaveLength(23);
    expect(s.maxInFlight()).toBe(TOPOLOGY_PAGE_CONCURRENCY);
    expect(await hydrateTopology(columns!, async () => {})).toEqual(topology);
  });

  it("ignores items a page was not asked for (a server ignoring `*Limit: 0`)", async () => {
    const topology = makeTopology(25_000, 150_000);
    const ignoresHints: Fault = (request) => {
      if (isFirst(request)) return null;
      const widened = {
        ...request,
        agentLimit: request.agentLimit || 500,
        edgeLimit: request.edgeLimit || 1000,
      };
      return { status: 200, body: { ...pageOf(topology, widened), ...request }, parseMs: 0 };
    };
    const { columns } = await loadAll(topology, ignoresHints);
    expect(await hydrateTopology(columns!, async () => {})).toEqual(topology);
  });

  it("keeps names and the backend's null floats (NaN/Infinity) as they came", async () => {
    const topology = makeTopology(3, 2);
    const agents = topology.agents.map((a, i) => ({
      ...a,
      name: i === 1 ? "Ana" : null,
      initialBelief: i === 2 ? null : a.initialBelief,
    }));
    const edges = topology.edges.map((e, j) => ({ ...e, influence: j === 0 ? null : e.influence }));
    const withNulls = { ...topology, agents, edges } as unknown as TopologyResponse;
    const { columns } = await loadAll(withNulls);

    expect(columns?.agents.names).toEqual([null, "Ana", null]);
    const hydrated = await hydrateTopology(columns!, async () => {});
    expect(hydrated).toEqual(withNulls);
    expect(hydrated.agents[2]?.initialBelief).toBeNull();
    expect(hydrated.edges[0]?.influence).toBeNull();
  });

  it("resolves null when the first page answers 202 (not ready), without retrying", async () => {
    const s = server(makeTopology(5, 5), () => ({ status: 202 }));
    await expect(
      fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }),
    ).resolves.toBeNull();
    expect(s.requests).toHaveLength(1);
  });
});

// ─── Retries and failures ────────────────────────────────────────────────────

describe("fetchTopologyColumns — retry, then failure (#128)", () => {
  it("retries a failing page with exponential backoff and completes", async () => {
    const topology = makeTopology(25_000, 250_000);
    noSleep.mockClear();
    const flaky: Fault = (request, attempt) =>
      isEdgePage(request, 100_000) && attempt <= 2 ? http(503) : null;
    const { s, columns } = await loadAll(topology, flaky);

    expect(
      s.attemptsOf({ agentOffset: 0, agentLimit: 0, edgeOffset: 100_000, edgeLimit: 100_000 }),
    ).toBe(3);
    expect(noSleep.mock.calls.map(([ms]) => ms)).toEqual([
      TOPOLOGY_RETRY_BASE_MS,
      TOPOLOGY_RETRY_BASE_MS * 2,
    ]);
    expect(await hydrateTopology(columns!, async () => {})).toEqual(topology);
  });

  it("retries network errors (fetch rejected) too", async () => {
    const topology = makeTopology(25_000, 120_000);
    const offline: Fault = (request, attempt) =>
      isEdgePage(request, 100_000) && attempt === 1 ? new TypeError("Failed to fetch") : null;
    const { columns } = await loadAll(topology, offline);
    expect(columns?.edges.source).toHaveLength(120_000);
  });

  it("fails the WHOLE download when a page still fails after its retries — no partial topology", async () => {
    const topology = makeTopology(25_000, 250_000);
    const s = server(topology, (request) => (isEdgePage(request, 200_000) ? http(500) : null));
    const progress: TopologyLoadProgress[] = [];
    const result = fetchTopologyColumns({
      fetchPage: s.fetchPage,
      sleep: noSleep,
      onProgress: (p) => progress.push(p),
    });

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TopologyLoadError);
    expect(error).toMatchObject({ kind: "http", status: 500, attempts: TOPOLOGY_PAGE_RETRIES + 1 });
    expect(
      s.attemptsOf({ agentOffset: 0, agentLimit: 0, edgeOffset: 200_000, edgeLimit: 100_000 }),
    ).toBe(TOPOLOGY_PAGE_RETRIES + 1);
    // The pages still in flight are aborted, and the download never reports completion
    expect(s.signals.every((signal) => signal.aborted)).toBe(true);
    expect(progress).not.toContainEqual({ stage: "download", pagesDone: 5, pagesTotal: 5 });
  });

  it("does not retry a non-retryable status (403, 404)", async () => {
    for (const status of [403, 404]) {
      const s = server(makeTopology(25_000, 10), (request) =>
        request.agentOffset === 10_000 ? http(status) : null,
      );
      const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
        (e: unknown) => e,
      );
      expect(error).toMatchObject({ kind: "http", status, attempts: 1 });
    }
  });

  it("retries a failing first page, and fails when it never recovers", async () => {
    const s = server(makeTopology(5, 5), () => http(502));
    const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "http", status: 502, attempts: TOPOLOGY_PAGE_RETRIES + 1 });
    expect(s.requests).toHaveLength(TOPOLOGY_PAGE_RETRIES + 1);
  });

  it("treats a later page answering 202 as a failure (the topology went away mid-download)", async () => {
    const s = server(makeTopology(25_000, 10), (request) =>
      request.agentOffset === 20_000 ? { status: 202 } : null,
    );
    const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "not-ready", status: 202 });
  });

  it("fails on a page with missing items (short page), after retrying it", async () => {
    const topology = makeTopology(25_000, 10);
    const short: Fault = (request) => {
      if (request.agentOffset !== 10_000) return null;
      const body = pageOf(topology, request);
      return { status: 200, body: { ...body, agents: body.agents.slice(1) }, parseMs: 0 };
    };
    const s = server(topology, short);
    const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "invalid", attempts: TOPOLOGY_PAGE_RETRIES + 1 });
  });

  it.each([
    ["not an object", () => "oops"],
    ["no arrays", (body: TopologyResponse) => ({ ...body, agents: undefined })],
    ["no counts", (body: TopologyResponse) => ({ ...body, agentCount: "many" })],
    [
      "an agent outside the page window",
      (body: TopologyResponse) => ({
        ...body,
        agents: body.agents.map((a, i) => (i === 0 ? { ...a, index: 0 } : a)),
      }),
    ],
    [
      "a malformed edge",
      (body: TopologyResponse) => ({
        ...body,
        edges: body.edges.map((e, i) => (i === 0 ? { ...e, source: -1 } : e)),
      }),
    ],
    ["counts that changed", (body: TopologyResponse) => ({ ...body, agentCount: 99_999 })],
  ])("rejects a page with %s", async (_label, mutate) => {
    const topology = makeTopology(25_000, 150_000);
    const bad: Fault = (request) => {
      if (request.agentOffset !== 10_000 && request.edgeOffset !== 100_000) return null;
      return { status: 200, body: mutate(pageOf(topology, request)), parseMs: 0 };
    };
    const s = server(topology, bad);
    const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TopologyLoadError);
    expect(error).toMatchObject({ kind: "invalid" });
  });

  it("rejects a first page that cannot be paged (empty, or more items than its counts)", async () => {
    const topology = makeTopology(25_000, 10);
    for (const agents of [[], [...topology.agents, ...topology.agents]]) {
      const s = server(topology, () => ({
        status: 200,
        body: { ...topology, agents },
        parseMs: 0,
      }));
      const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
        (e: unknown) => e,
      );
      expect(error).toMatchObject({ kind: "invalid" });
    }
  });

  it("detects agents missing at the end (duplicate indexes within a window)", async () => {
    const topology = makeTopology(25_000, 10);
    const duplicated: Fault = (request) => {
      if (request.agentOffset !== 10_000) return null;
      const body = pageOf(topology, request);
      const agents = body.agents.map((a, i) =>
        i === 1 ? { ...a, index: body.agents[0]?.index } : a,
      );
      return { status: 200, body: { ...body, agents }, parseMs: 0 };
    };
    const s = server(topology, duplicated);
    const error = await fetchTopologyColumns({ fetchPage: s.fetchPage, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "invalid", message: "topology has 24999 of 25000 agents" });
  });

  it("uses the default backoff (real timers) when no sleep is given", async () => {
    vi.useFakeTimers();
    try {
      const topology = makeTopology(5, 5);
      const s = server(topology, (_request, attempt) => (attempt === 1 ? http(503) : null));
      const pages: number[] = [];
      const result = fetchTopologyColumns({
        fetchPage: s.fetchPage,
        onPage: ({ parseMs }) => pages.push(parseMs),
      });
      await vi.advanceTimersByTimeAsync(TOPOLOGY_RETRY_BASE_MS);
      expect(await result).not.toBeNull();
      expect(pages).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
