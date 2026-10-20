import type { BenchEnvironment, UaMemoryResult } from "./environment";
import type { FrameSummary } from "./frame-stats";
import type { GpuMemoryEstimate } from "./gpu-estimate";

/**
 * Exported benchmark results (#126): one JSON document per suite run (or per HUD recording),
 * versioned by `schemaVersion`. The aggregation script (`benchmarks/scripts/aggregate.ts`)
 * validates both fields before reading a file.
 *
 * Keep this module free of `@/` imports: the Bun CLI imports it through relative paths.
 */

export const BENCH_SCHEMA_VERSION = 1;

/** Marker string that only harness code contains — also used to prove normal builds drop it. */
export const BENCH_HARNESS_MARKER = "silensess-bench-harness";

export type BenchPhaseName =
  | "layout"
  | "idle"
  | "interaction"
  | "repaint"
  | "cluster-layout"
  | "cluster-idle"
  | "cluster-interaction"
  | "hud-record";

export interface PhaseResult {
  phase: BenchPhaseName;
  /** Repaint: playback speed ("x16"); cluster phases: the cluster mode; otherwise null. */
  variant: string | null;
  warmupMs: number;
  /** Configured measured window (layout / cluster-layout: the transition itself). */
  measureMs: number;
  /** Wall time actually recorded. */
  actualMs: number;
  frames: FrameSummary;
  longTasks: { supported: boolean; count: number; totalMs: number; maxMs: number };
  heap: {
    supported: boolean;
    samples: number;
    minBytes: number | null;
    maxBytes: number | null;
    endBytes: number | null;
    totalEndBytes: number | null;
    limitBytes: number | null;
  };
  uaMemory: UaMemoryResult | null;
  repaint: {
    speed: number;
    targetRoundsPerSecond: number;
    roundsRendered: number;
    repaintsPerSecond: number;
  } | null;
}

/** Load steps of one network (ms); null when the step did not happen or was not observed. */
export interface LoadTimings {
  /** Synthetic: seeded generation of the topology object. */
  generateMs: number | null;
  /** Real run: `getTopologyFull` from start to resolve (all pages, JSON parse included). */
  fetchMs: number | null;
  /** Real run: fetch start → last topology byte (Resource Timing). */
  networkMs: number | null;
  /**
   * Synthetic: JSON.parse of the serialized topology (stands in for the HTTP response parse).
   * Real run: axios JSON parse of the topology pages of this network.
   */
  parseMs: number | null;
  /** `topologyToData`. */
  toDataMs: number | null;
  /** `prepareCosmographData` (DuckDB-WASM). */
  prepareMs: number | null;
  /** Data ready → canvas committed its layout phase (React commit + Cosmograph mount). */
  mountMs: number | null;
  /** Layout phase → frozen (force layout, time-boxed by LAYOUT_DURATION_MS). */
  layoutMs: number | null;
  /** First step start → frozen. */
  totalMs: number | null;
  /** Real run: how many topology fetches ran for this network (2 = a concurrent duplicate). */
  topologyFetches: number | null;
}

export interface ScenarioResult {
  id: string;
  source: "synthetic" | "real-run";
  agents: number;
  edges: number;
  /** Generated-run density (m); inferred from the counts for real runs, null for custom runs. */
  density: number | null;
  repetition: number;
  seed: number | null;
  runId: string | null;
  networkId: string | null;
  status: "ok" | "error" | "aborted";
  error: string | null;
  stage: { width: number; height: number; devicePixelRatio: number };
  load: LoadTimings;
  gpuMemoryEstimate: GpuMemoryEstimate | null;
  /** Whether `gc()` was available (Chrome --js-flags=--expose-gc) and called before the scenario. */
  forcedGc: boolean;
  phases: PhaseResult[];
}

export interface BenchBuildInfo {
  /** Rsbuild mode: "production" for `bun run bench`, "development" for `bench:dev`. */
  mode: string;
  appVersion: string;
  gitCommit: string;
  gitDirty: boolean | null;
  builtAt: string;
}

export interface BenchResultDocument {
  schemaVersion: typeof BENCH_SCHEMA_VERSION;
  harness: typeof BENCH_HARNESS_MARKER;
  kind: "suite" | "hud-record";
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** False when the run was aborted or exported before it finished. */
  complete: boolean;
  build: BenchBuildInfo;
  environment: BenchEnvironment;
  /** The full suite configuration (SuiteConfig), or the HUD recording parameters. */
  config: Record<string, unknown>;
  scenarios: ScenarioResult[];
  /** Conditions that may invalidate numbers (tab hidden mid-run, software rendering…). */
  warnings: string[];
  /** The unmeasured pre-warm load of a suite (DuckDB-WASM cold start), null when disabled. */
  prewarm: ScenarioResult | null;
}

export type ValidationResult =
  | { ok: true; doc: BenchResultDocument }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Structural validation of an exported document (schema version, marker, required arrays). */
export function validateResultDocument(raw: unknown): ValidationResult {
  if (!isObject(raw)) return { ok: false, error: "not a JSON object" };
  if (raw.harness !== BENCH_HARNESS_MARKER) return { ok: false, error: "not a benchmark result" };
  if (raw.schemaVersion !== BENCH_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unsupported schemaVersion ${String(raw.schemaVersion)} (expected ${BENCH_SCHEMA_VERSION})`,
    };
  }
  if (raw.kind !== "suite" && raw.kind !== "hud-record")
    return { ok: false, error: "unknown kind" };
  if (!isObject(raw.build) || !isObject(raw.environment)) {
    return { ok: false, error: "missing build or environment" };
  }
  if (!Array.isArray(raw.scenarios)) return { ok: false, error: "missing scenarios" };
  for (const scenario of raw.scenarios) {
    if (!isObject(scenario) || !Array.isArray(scenario.phases) || !isObject(scenario.load)) {
      return { ok: false, error: "malformed scenario" };
    }
    if (typeof scenario.agents !== "number" || typeof scenario.id !== "string") {
      return { ok: false, error: "malformed scenario" };
    }
    for (const phase of scenario.phases) {
      if (!isObject(phase) || typeof phase.phase !== "string" || !isObject(phase.frames)) {
        return { ok: false, error: `malformed phase in scenario ${scenario.id}` };
      }
    }
  }
  return { ok: true, doc: raw as unknown as BenchResultDocument };
}

export const EMPTY_LOAD_TIMINGS: LoadTimings = {
  generateMs: null,
  fetchMs: null,
  networkMs: null,
  parseMs: null,
  toDataMs: null,
  prepareMs: null,
  mountMs: null,
  layoutMs: null,
  totalMs: null,
  topologyFetches: null,
};

/** File name stem: date, time and commit, e.g. `bench-2026-10-19T20-15-03-ed59e82`. */
export function resultFileStem(doc: Pick<BenchResultDocument, "kind" | "startedAt" | "build">) {
  const stamp = doc.startedAt.replace(/\.\d+Z$/, "").replace(/:/g, "-");
  const prefix = doc.kind === "suite" ? "bench" : "hud";
  return `${prefix}-${stamp}-${doc.build.gitCommit.slice(0, 7)}`;
}

/** A unique id for a result document. */
export function newResultId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createResultDocument(input: {
  kind: BenchResultDocument["kind"];
  build: BenchBuildInfo;
  environment: BenchEnvironment;
  config: Record<string, unknown>;
  startedAt?: Date;
  id?: string;
}): BenchResultDocument {
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    harness: BENCH_HARNESS_MARKER,
    kind: input.kind,
    id: input.id ?? newResultId(),
    startedAt: (input.startedAt ?? new Date()).toISOString(),
    finishedAt: null,
    complete: false,
    build: input.build,
    environment: input.environment,
    config: input.config,
    scenarios: [],
    warnings: [],
    prewarm: null,
  };
}
