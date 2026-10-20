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
  /** `simulationsApi.getTopologyFull` started (detail: runId, networkId, callId). */
  | "topology-fetch-start"
  /** `getTopologyFull` resolved with the merged topology (detail: + agents, edges). */
  | "topology-fetch-end"
  /** One topology page was parsed by axios (detail: runId, networkId, durationMs). */
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
  | "canvas-error";

export interface BenchProbeDetail {
  runId?: string;
  networkId?: string;
  agents?: number;
  edges?: number;
  /** Duration measured at the call site (topology-parse). */
  durationMs?: number;
  /** Correlates the start and end of one topology fetch. */
  callId?: number;
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

/** What the mounted simulation canvas exposes to the harness. */
export interface BenchCanvasHandle {
  networkId: string | null;
  /** The live Cosmograph instance; undefined until it is created. */
  getCosmograph: () => BenchCosmograph | undefined;
  /** Same entry point as the "Agrupar" control. */
  setClusterMode: (mode: BenchClusterMode | null) => void;
}

/** Events kept for late subscribers (the lazily loaded HUD mounts after the fetch started). */
export const BENCH_PROBE_HISTORY_LIMIT = 256;

interface ProbeState {
  listeners: Set<BenchProbeListener>;
  history: BenchProbeEvent[];
  canvas: BenchCanvasHandle | null;
  nextCallId: number;
}

let state: ProbeState | null = null;

function probeState(): ProbeState {
  if (state === null) {
    state = { listeners: new Set(), history: [], canvas: null, nextCallId: 1 };
  }
  return state;
}

/** Emits a probe event: a `performance.mark` (visible in DevTools) plus the in-page listeners. */
export function benchProbe(name: BenchProbeName, detail: BenchProbeDetail = {}): BenchProbeEvent {
  const event: BenchProbeEvent = { name, at: performance.now(), detail };
  try {
    performance.mark(`bench:${name}`);
  } catch {
    // performance.mark is optional instrumentation — never break the product path
  }
  const s = probeState();
  s.history.push(event);
  if (s.history.length > BENCH_PROBE_HISTORY_LIMIT) s.history.shift();
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

/** Test helper: drops listeners, history and the canvas handle. */
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
