import type {
  AxiosResponseHeaders,
  AxiosResponseTransformer,
  InternalAxiosRequestConfig,
} from "axios";

/**
 * Benchmark probe (#126): a small event bus between the product code (topology fetch, simulation
 * canvas) and the benchmark harness (`features/benchmark`: /bench suite page and run-view HUD).
 *
 * Bench builds only. Every product call site leads with the build-time constant —
 * `if (__BENCHMARK__) benchProbe(…)` — so a normal build drops the calls as dead code and then
 * this module as unused. The module keeps no top-level side effects for that reason: its state
 * is created on first use.
 */

export type BenchProbeName =
  /**
   * `simulationsApi.getTopologyFull` started: one actual download of a network's topology
   * (detail: runId, networkId, callId).
   */
  | "topology-fetch-start"
  /** `getTopologyFull` resolved with the merged topology (detail: + agents, edges). */
  | "topology-fetch-end"
  /** A topology load joined the download in flight for its network (#140; detail: runId, networkId). */
  | "topology-fetch-join"
  /**
   * A topology load got the completed topology of an earlier download of its network (#140;
   * detail: runId, networkId).
   */
  | "topology-fetch-reuse"
  /**
   * One topology page was parsed (detail: runId, networkId, durationMs): by axios for a single
   * `getTopology` page, in the topology worker for the pages of a full download (#128).
   */
  | "topology-parse"
  /** The canvas started `topologyToData` for a topology (detail: network, agents, edges). */
  | "canvas-prepare-start"
  /** `topologyToData` returned. */
  | "canvas-to-data-end"
  /** `prepareCosmographData` resolved. */
  | "canvas-prepare-end"
  /** The canvas committed its "layouting" phase: Cosmograph is mounted, the layout runs. */
  | "canvas-layout-start"
  /** The canvas committed its "frozen" phase: the force layout stopped. */
  | "canvas-frozen"
  /** The canvas reached its "error" phase. */
  | "canvas-error"
  /** Cosmograph finished uploading the graph data (its `graphRebuilt` event). */
  | "cosmograph-graph-rebuilt"
  /** Cosmograph applied new cluster assignments (its `clustersUpdated` event). */
  | "cosmograph-clusters-updated"
  /** The force simulation (re)started (Cosmograph `onSimulationStart`). */
  | "cosmograph-simulation-start"
  /**
   * First simulation tick after a (re)start, a data rebuild or a cluster update: the first frame
   * Cosmograph renders with the new data and the simulation running.
   */
  | "cosmograph-first-tick"
  /** The force simulation stopped (Cosmograph `onSimulationEnd`). */
  | "cosmograph-simulation-end"
  // ── High-frequency events (per round / per config update): listeners only, see below ──
  /** The canvas committed a new viewed frame (detail: round). */
  | "canvas-frame-commit"
  /** A Cosmograph `setConfig` call settled (detail: durationMs, syncMs). */
  | "cosmograph-config-done"
  /** Cosmograph recomputed and uploaded the point colours (`pointColorUpdated`). */
  | "cosmograph-colors-updated";

/**
 * Emitted once per round or per config update: no `performance.mark` and no history (a long
 * suite would otherwise accumulate tens of thousands of entries), listeners only.
 */
export const HIGH_FREQUENCY_PROBES: readonly BenchProbeName[] = [
  "canvas-frame-commit",
  "cosmograph-config-done",
  "cosmograph-colors-updated",
];

export interface BenchProbeDetail {
  runId?: string;
  networkId?: string;
  agents?: number;
  edges?: number;
  /** Duration measured at the call site (topology-parse). */
  durationMs?: number;
  /** Correlates the start and end of one topology fetch. */
  callId?: number;
  /** Viewed round of a committed frame (canvas-frame-commit). */
  round?: number;
  /** Synchronous part of a Cosmograph setConfig call (cosmograph-config-done). */
  syncMs?: number;
}

export interface BenchProbeEvent {
  name: BenchProbeName;
  /** `performance.now()` when the event was emitted. */
  at: number;
  detail: BenchProbeDetail;
}

export type BenchProbeListener = (event: BenchProbeEvent) => void;

/** The subset of the Cosmograph instance API the harness drives (zoom and pan). */
export interface BenchCosmograph {
  setZoomLevel(value: number, duration?: number): void;
  getZoomLevel(): number | undefined;
  fitView(duration?: number, padding?: number): void;
  zoomToPoint(index: number, duration?: number, scale?: number, canZoomOut?: boolean): void;
}

export type BenchClusterMode = "strategy" | "belief" | "effect";

/**
 * Canvas variants the harness can switch on a mounted canvas (#126, LOD study #50):
 * - `baseline`: the product as shipped;
 * - `links-transparent`: the product's own "hide links" toggle (transparent colour, links still
 *   drawn);
 * - `links-off`: `renderLinks: false`;
 * - `straight-links`: `curvedLinks: false`.
 * (`one-link-per-pair` changes the data, so the harness remounts the canvas for it instead.)
 */
export type BenchCanvasOverlay = "baseline" | "links-transparent" | "links-off" | "straight-links";

/** What the mounted simulation canvas exposes to the harness. */
export interface BenchCanvasHandle {
  networkId: string | null;
  /** The live Cosmograph instance; undefined until it is created. */
  getCosmograph: () => BenchCosmograph | undefined;
  /** Same entry point as the "Agrupar" control. */
  setClusterMode: (mode: BenchClusterMode | null) => void;
  /** Switches the canvas variant through the canvas' own state (see BenchCanvasOverlay). */
  setOverlay: (overlay: BenchCanvasOverlay) => void;
  /** The WebGL renderer string of the context Cosmograph actually draws with. */
  getRenderer: () => string | null;
  /** Cosmograph setConfig calls still in flight (wait for 0 before unmounting the canvas). */
  pendingUpdates: () => number;
}

/** Events kept for late subscribers (the lazily loaded HUD mounts after the fetch started). */
export const BENCH_PROBE_HISTORY_LIMIT = 256;

/** A Resource Timing entry the main thread cannot see itself (main-thread clock). */
export interface BenchResourceEntry {
  name: string;
  startTime: number;
  responseEnd: number;
}

/** Relayed resource entries kept (the topology pages of a few downloads). */
export const BENCH_RESOURCE_LIMIT = 256;

interface ProbeState {
  listeners: Set<BenchProbeListener>;
  history: BenchProbeEvent[];
  canvas: BenchCanvasHandle | null;
  nextCallId: number;
  resources: BenchResourceEntry[];
}

let state: ProbeState | null = null;

function probeState(): ProbeState {
  if (state === null) {
    state = { listeners: new Set(), history: [], canvas: null, nextCallId: 1, resources: [] };
  }
  return state;
}

/** Emits a probe event: a `performance.mark` (visible in DevTools) plus the in-page listeners. */
export function benchProbe(name: BenchProbeName, detail: BenchProbeDetail = {}): BenchProbeEvent {
  const event: BenchProbeEvent = { name, at: performance.now(), detail };
  const s = probeState();
  if (!HIGH_FREQUENCY_PROBES.includes(name)) {
    try {
      performance.mark(`bench:${name}`);
    } catch {
      // performance.mark is optional instrumentation — never break the product path
    }
    s.history.push(event);
    if (s.history.length > BENCH_PROBE_HISTORY_LIMIT) s.history.shift();
  }
  for (const listener of s.listeners) {
    try {
      listener(event);
    } catch {
      // a faulty harness listener must not break the product path
    }
  }
  return event;
}

export function subscribeBenchProbe(listener: BenchProbeListener): () => void {
  const s = probeState();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

/** Recent events, oldest first (bounded by {@link BENCH_PROBE_HISTORY_LIMIT}). */
export function getBenchProbeHistory(): readonly BenchProbeEvent[] {
  return probeState().history;
}

/** A fresh id to correlate the start and end events of one call. */
export function nextBenchCallId(): number {
  const s = probeState();
  return s.nextCallId++;
}

/**
 * Records Resource Timing entries made off the main thread — the topology worker's pages (#128):
 * a worker keeps its own performance timeline, so `performance.getEntriesByType("resource")` on
 * the page would miss them and the HUD's network time would be blank.
 */
export function recordBenchResources(entries: readonly BenchResourceEntry[]): void {
  const s = probeState();
  s.resources.push(...entries);
  if (s.resources.length > BENCH_RESOURCE_LIMIT) {
    s.resources.splice(0, s.resources.length - BENCH_RESOURCE_LIMIT);
  }
}

/** Entries recorded by {@link recordBenchResources}, oldest first. */
export function getBenchResources(): readonly BenchResourceEntry[] {
  return probeState().resources;
}

/** Registers the mounted canvas; the returned function unregisters it (if still current). */
export function registerBenchCanvas(handle: BenchCanvasHandle): () => void {
  const s = probeState();
  s.canvas = handle;
  return () => {
    if (s.canvas === handle) s.canvas = null;
  };
}

export function getBenchCanvas(): BenchCanvasHandle | null {
  return probeState().canvas;
}

/** Test helper: drops listeners, history, relayed resources and the canvas handle. */
export function resetBenchProbe(): void {
  state = null;
}

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** Runtime guard on top of the build flag: the harness only activates on a loopback host. */
export function isBenchmarkHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.includes(hostname.toLowerCase());
}

/**
 * Wraps axios' response transformers (JSON parse) and reports how long they took. axios replaces
 * — not extends — the defaults when a request passes `transformResponse`, so the defaults are
 * run inside the wrapper, unchanged.
 */
export function withParseTiming(
  base: AxiosResponseTransformer | AxiosResponseTransformer[] | undefined,
  onTimed: (durationMs: number) => void,
): AxiosResponseTransformer {
  const chain = base === undefined ? [] : Array.isArray(base) ? base : [base];
  return function timedTransform(
    this: InternalAxiosRequestConfig,
    data: unknown,
    headers: AxiosResponseHeaders,
    status?: number,
  ) {
    const start = performance.now();
    let out = data;
    for (const transform of chain) {
      out = transform.call(this, out, headers, status);
    }
    onTimed(performance.now() - start);
    return out;
  };
}
