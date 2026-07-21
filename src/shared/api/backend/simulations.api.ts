import "./auth-interceptor";
import { logger } from "@/shared/lib/logger";
import { backendClient } from "./client";
import type {
  CustomRunRequest,
  GeneratedRunRequest,
  NetworkListResponse,
  PaginationParams,
  ResultsParams,
  ResultsResponse,
  RunCancelledResponse,
  RunSummary,
  SimCreated,
  SimulationListResponse,
  TopologyParams,
  TopologyResponse,
  WsTicketResponse,
} from "./types/backend.types";

export const simulationsApi = {
  async startGenerated(body: GeneratedRunRequest): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/generated", body);
    return data;
  },

  async startCustom(body: CustomRunRequest): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/custom", body);
    return data;
  },

  async startCustomBinary(payload: ArrayBuffer): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/custom", payload, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    return data;
  },

  async listMine(params?: PaginationParams): Promise<SimulationListResponse> {
    const { data } = await backendClient.get<SimulationListResponse>("/simulations/mine", {
      params,
    });
    return data;
  },

  async listAll(params?: PaginationParams): Promise<SimulationListResponse> {
    const { data } = await backendClient.get<SimulationListResponse>("/simulations", { params });
    return data;
  },

  async getById(runId: string): Promise<RunSummary> {
    const { data } = await backendClient.get<RunSummary>(`/simulations/${runId}`);
    return data;
  },

  async cancel(runId: string): Promise<RunCancelledResponse> {
    const { data } = await backendClient.delete<RunCancelledResponse>(`/simulations/${runId}`);
    return data;
  },

  async listNetworks(runId: string): Promise<NetworkListResponse> {
    const { data } = await backendClient.get<NetworkListResponse>(`/simulations/${runId}/networks`);
    return data;
  },

  async getTopology(
    runId: string,
    networkId: string,
    params?: TopologyParams,
  ): Promise<TopologyResponse | null> {
    const response = await backendClient.get<TopologyResponse>(
      `/simulations/${runId}/networks/${networkId}/topology`,
      { params, validateStatus: (s) => s === 200 || s === 202 },
    );
    if (response.status === 202) return null;
    return response.data;
  },

  /**
   * Fetches the FULL topology by paginating through both agents and edges.
   *
   * Strategy:
   * - First call requests aggressively-large page sizes (10k agents,
   *   100k edges). The backend will cap to its real max — we'll see what we
   *   actually got via the response's `agentLimit` / `edgeLimit` fields.
   * - Remaining pages run in parallel via `Promise.all`. Browser connection
   *   limits (~6 per origin) implicitly throttle concurrency.
   * - Per-page failures (e.g. 404 when a DEBUG run is purged mid-fetch)
   *   degrade gracefully — the page is logged and skipped, not propagated.
   * - Dedup by natural key (`agent.index`, `${source}-${target}`) is robust
   *   to pages where the server ignored our `*Limit: 0` hint.
   */
  async getTopologyFull(runId: string, networkId: string): Promise<TopologyResponse | null> {
    // Request aggressively large first-page sizes to minimize round-trips.
    // The server's effective cap is reflected in the response.
    const first = await this.getTopology(runId, networkId, {
      agentOffset: 0,
      agentLimit: 10_000,
      edgeOffset: 0,
      edgeLimit: 100_000,
    });
    if (first === null) return null;

    const { agentCount, edgeCount, agentLimit, edgeLimit } = first;

    const safePage = (params: TopologyParams): Promise<TopologyResponse | null> =>
      this.getTopology(runId, networkId, params).catch((err: unknown) => {
        // Per-page failures (404 from DEBUG-run purges, transient 5xx) should
        // not abort the whole fetch — return null and let dedup skip the page.
        logger.error("getTopologyFull.page", err);
        return null;
      });

    const agentPagePromises: Promise<TopologyResponse | null>[] = [];
    if (agentLimit > 0) {
      for (let offset = agentLimit; offset < agentCount; offset += agentLimit) {
        agentPagePromises.push(
          safePage({ agentOffset: offset, agentLimit, edgeOffset: 0, edgeLimit: 0 }),
        );
      }
    }

    const edgePagePromises: Promise<TopologyResponse | null>[] = [];
    if (edgeLimit > 0) {
      for (let offset = edgeLimit; offset < edgeCount; offset += edgeLimit) {
        edgePagePromises.push(
          safePage({ agentOffset: 0, agentLimit: 0, edgeOffset: offset, edgeLimit }),
        );
      }
    }

    const [agentPages, edgePages] = await Promise.all([
      Promise.all(agentPagePromises),
      Promise.all(edgePagePromises),
    ]);

    const agentMap = new Map<number, (typeof first.agents)[number]>();
    for (const a of first.agents) agentMap.set(a.index, a);
    for (const page of agentPages) {
      if (page === null) continue;
      for (const a of page.agents) agentMap.set(a.index, a);
    }

    const edgeMap = new Map<string, (typeof first.edges)[number]>();
    for (const e of first.edges) edgeMap.set(`${e.source}-${e.target}`, e);
    for (const page of edgePages) {
      if (page === null) continue;
      for (const e of page.edges) edgeMap.set(`${e.source}-${e.target}`, e);
    }

    const agents = Array.from(agentMap.values()).sort((a, b) => a.index - b.index);
    const edges = Array.from(edgeMap.values());

    return {
      ...first,
      agentOffset: 0,
      agentLimit: agents.length,
      edgeOffset: 0,
      edgeLimit: edges.length,
      agents,
      edges,
    };
  },

  async getResults(
    runId: string,
    networkId: string,
    params?: ResultsParams,
  ): Promise<ResultsResponse | null> {
    const response = await backendClient.get<ResultsResponse>(
      `/simulations/${runId}/networks/${networkId}/results`,
      { params, validateStatus: (s) => s === 200 || s === 202 },
    );
    if (response.status === 202) return null;
    return response.data;
  },

  async getWsTicket(runId: string): Promise<WsTicketResponse> {
    const { data } = await backendClient.post<WsTicketResponse>(`/simulations/${runId}/ws-ticket`);
    return data;
  },

  /**
   * Fetches persisted binary frames. Body is a concatenation of slices in the
   * same wire format the WebSocket emits — the existing worker parser handles
   * it without changes.
   *
   * @returns ArrayBuffer with concatenated slices, or `null` when the run was
   *          created without `persistFrames: true` (404 `frames_not_persisted`)
   *          or the requested round is outside the persisted range.
   */
  async getFrames(
    runId: string,
    networkId: string,
    query: { round: number | "last" } | { from: number; to: number },
  ): Promise<ArrayBuffer | null> {
    const params: Record<string, string | number> =
      "round" in query ? { round: query.round } : { from: query.from, to: query.to };

    const response = await backendClient.get<ArrayBuffer>(
      `/simulations/${runId}/networks/${networkId}/frames`,
      {
        params,
        responseType: "arraybuffer",
        validateStatus: (s) => s === 200 || s === 404,
      },
    );
    if (response.status === 404) return null;
    return response.data;
  },
};
