import type { AxiosRequestConfig } from "axios";
import {
  benchProbe,
  nextBenchCallId,
  recordBenchResources,
  withParseTiming,
} from "@/shared/lib/bench-probe";
import type { TopologyLoadProgress } from "@/shared/workers/topology-transfer";
import { currentIdToken } from "./auth-interceptor";
import { backendClient } from "./client";
import type {
  CustomRunRequest,
  GeneratedRunConfig,
  GeneratedRunRequest,
  NetworkListResponse,
  PaginationParams,
  PolarizationCatalog,
  PolarizationRequest,
  PolarizationResult,
  ResultsParams,
  ResultsResponse,
  RunCancelledResponse,
  RunSummary,
  SimCreated,
  SimulationListResponse,
  TopologyParams,
  TopologyResponse,
} from "./types/backend.types";

export interface TopologyFullOptions {
  /** Progress of this download (pages, then assembly). */
  onProgress?: (progress: TopologyLoadProgress) => void;
}

/** pol_measures on the server (#129): GET /simulations/polarization/measures, POST …/polarization. */
const polarizationEndpoints = {
  /**
   * The pol_measures catalog of the server (#129): measures, parameters with the package's
   * defaults and ranges, supported k, thresholds, f(d) options, limits and versions. 404 when the
   * server has polarization disabled (APP_POLARIZATION=false), 503 when its worker is unavailable.
   */
  async getPolarizationMeasures(): Promise<PolarizationCatalog> {
    const { data } = await backendClient.get<PolarizationCatalog>(
      "/simulations/polarization/measures",
    );
    return data;
  },

  /**
   * One measure over a series of k-category histograms (one per round), computed on the server by
   * pol_measures (#129). At most `catalog.limits.maxRounds` histograms per call. Errors: 400
   * `invalid_body`, 422 `invalid_measure`, 404 (disabled), 503 `unavailable`.
   */
  async computePolarization(body: PolarizationRequest): Promise<PolarizationResult> {
    const { data } = await backendClient.post<PolarizationResult>(
      "/simulations/polarization",
      body,
    );
    return data;
  },
};

/** What a build without polarization has instead (nothing; no code calls it there). */
const compiledOut = {} as typeof polarizationEndpoints;

export const simulationsApi = {
  async startGenerated(body: GeneratedRunRequest): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/generated", body);
    return data;
  },

  async startCustom(body: CustomRunRequest): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/custom", body);
    return data;
  },

  /**
   * The binary payload has no `persistFrames` / `frameRetention` fields, so they travel as
   * query parameters (`?persistFrames=true&frameRetention=ephemeral`) with the same meaning
   * as the JSON body fields.
   */
  async startCustomBinary(
    payload: ArrayBuffer,
    frameOptions?: Pick<CustomRunRequest, "persistFrames" | "frameRetention">,
  ): Promise<SimCreated> {
    const { data } = await backendClient.post<SimCreated>("/simulations/custom", payload, {
      headers: { "Content-Type": "application/octet-stream" },
      params: frameOptions,
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

  /** Stored configuration of a generated run, to re-launch it (#127). 404 for custom runs. */
  async getConfig(runId: string): Promise<GeneratedRunConfig> {
    const { data } = await backendClient.get<GeneratedRunConfig>(`/simulations/${runId}/config`);
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
    const config: AxiosRequestConfig = { params, validateStatus: (s) => s === 200 || s === 202 };
    if (__BENCHMARK__) {
      // Bench builds only (#126): times the JSON parse of each page for the debug HUD.
      config.transformResponse = withParseTiming(backendClient.defaults.transformResponse, (ms) =>
        benchProbe("topology-parse", { runId, networkId, durationMs: ms }),
      );
    }
    const response = await backendClient.get<TopologyResponse>(
      `/simulations/${runId}/networks/${networkId}/topology`,
      config,
    );
    if (response.status === 202) return null;
    return response.data;
  },

  /**
   * Fetches the FULL topology by paginating through both agents and edges, in the topology
   * worker (#128): fetch, JSON parse and page merge run off the main thread, and the topology
   * comes back as typed columns that are turned into objects in short slices
   * (`shared/workers/topology-fetch*.ts`).
   *
   * - The first page asks for 10k agents / 100k edges; its counts plan the other pages, which
   *   run at most 6 at a time.
   * - A failed page is retried a bounded number of times with backoff; if it still fails, the
   *   whole call rejects with a `TopologyLoadError` — no topology with a page missing is ever
   *   returned (pages used to be skipped silently).
   * - Resolves null when the first page answers 202 (not ready).
   * - Auth: a fresh Firebase ID token per call, handed to the worker (never persisted); a 401
   *   gets one force-refreshed token and one retry, as with the axios interceptor.
   * - `onProgress` reports the pages downloaded, then the assembly step.
   *
   * Every call is one full download. Views load topologies through
   * `loadTopology` (entities/simulation), which shares concurrent and repeated
   * loads of the run being viewed (#140) and fans the progress out to every consumer.
   */
  async getTopologyFull(
    runId: string,
    networkId: string,
    options: TopologyFullOptions = {},
  ): Promise<TopologyResponse | null> {
    // Bench builds only (#126): load timings of the current network for the debug HUD.
    const benchCallId = __BENCHMARK__ ? nextBenchCallId() : 0;
    if (__BENCHMARK__) {
      benchProbe("topology-fetch-start", { runId, networkId, callId: benchCallId });
    }

    // Lazy chunk: the worker client (and the worker it starts) load with the first download.
    const { fetchTopologyInWorker } = await import(
      /* webpackChunkName: "topology-fetch" */ "@/shared/workers/topology-fetch.client"
    );
    const topology = await fetchTopologyInWorker({
      baseUrl: new URL(backendClient.defaults.baseURL ?? "/", globalThis.location.href).href,
      runId,
      networkId,
      getToken: currentIdToken,
      onProgress: options.onProgress,
      // Bench builds only (#126): per-page parse times and the worker's Resource Timing entries.
      onPage: __BENCHMARK__
        ? ({ parseMs }) => benchProbe("topology-parse", { runId, networkId, durationMs: parseMs })
        : undefined,
      onResources: __BENCHMARK__ ? recordBenchResources : undefined,
    });

    if (__BENCHMARK__ && topology !== null) {
      benchProbe("topology-fetch-end", {
        runId,
        networkId,
        callId: benchCallId,
        agents: topology.agents.length,
        edges: topology.edges.length,
      });
    }
    return topology;
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

  // polarization (#129): only the run-polarization feature calls these; a build with
  // PUBLIC_ENABLE_POLARIZATION=false folds the spread to `{}` and drops them.
  ...(__POLARIZATION__ ? polarizationEndpoints : compiledOut),
};
