import type { BenchEnvironment, UaMemoryResult } from "./environment";
import type { FrameSummary } from "./frame-stats";
import type { GpuMemoryEstimate } from "./gpu-estimate";

/**
 * Exported benchmark results (#126): one JSON document per suite run (or per HUD recording),
 * versioned by `schemaVersion`. The aggregation script (`benchmarks/scripts/aggregate.ts`)
 * validates both fields before reading a file.
 *
 * Version 2 (this harness) adds, all optional for readers of version 1 files:
 * - phases: `canvasVariant`, `links` (in the data / drawn), `lead` (the interval excluded before a
 *   layout window: data upload until the first frame drawn with the data) and
 *   `repaint.breakdown` (per-round timings of the repaint path);
 * - load timings: `uploadMs` and the long tasks of the upload;
 * - scenarios: `canvasRenderer` (GPU the canvas actually used), `timeline`, `variantLoads`.
 * In version 1 files the `layout` / `cluster-layout` windows started at the canvas' layout
 * commit, before the data upload: they are not comparable with version 2 (see the report).
 *
 * Keep this module free of `@/` imports: the Bun CLI imports it through relative paths.
 */

export const BENCH_SCHEMA_VERSION = 2;

/** Versions the aggregation script reads. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

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

/**
 * Canvas variants measured for the LOD decision (#50); `baseline` is the product as shipped.
 * `one-link-per-pair` keeps one of the two reciprocal edges of every pair (a remount with the
 * deduplicated data); the others switch a mounted canvas (see BenchCanvasOverlay).
 */
export const CANVAS_VARIANTS = [
  "baseline",
  "links-transparent",
  "links-off",
  "straight-links",
  "one-link-per-pair",
] as const;
export type CanvasVariant = (typeof CANVAS_VARIANTS)[number];

export interface DistributionStat {
  median: number | null;
  p95: number | null;
  mean: number | null;
}

/** The interval excluded before a layout window (v2). */
export interface LeadWindow {
  /** `upload`: layout commit → first frame with the data; `cluster-update`: grouping change → first frame with the clusters. */
  label: "upload" | "cluster-update";
  durationMs: number;
  /** How the window start was found: Cosmograph's first simulation tick, or none seen (fallback: no split). */
  startedBy: "first-tick" | "fallback";
  frames: number;
  maxFrameMs: number | null;
  longTasks: { supported: boolean; count: number; totalMs: number; maxMs: number };
}

/** Per-round timings of the repaint path inside the measured window (v2). */
export interface RepaintBreakdown {
  /** Rounds pushed to the store inside the window. */
  rounds: number;
  /** Replay merge of one round (`mergeRoundFromChunk`: wire parse into typed arrays). */
  mergeMs: DistributionStat;
  /** `store.updateFrame` → the canvas committed the frame (React render of the canvas). */
  commitMs: DistributionStat;
  /** Cosmograph `setConfig` calls that settled inside the window. */
  cosmographUpdates: number;
  /**
   * One setConfig call, from the call until it settled: Cosmograph re-queries the point table
   * (DuckDB-WASM worker), recomputes colours and sizes in JS and uploads them.
   */
  cosmographUpdateMs: DistributionStat;
  /** The synchronous part of those calls (main thread, before the first await). */
  cosmographSyncMs: DistributionStat;
  /** `pointColorUpdated` events (colour buffers recomputed and uploaded). */
  colorUpdates: number;
  /** Mean frame time of the window. */
  frameMs: number | null;
  /** Long-task time per second of window (main thread blocked > 50 ms at a time). */
  longTaskMsPerSecond: number | null;
}

export interface PhaseResult {
  phase: BenchPhaseName;
  /** Repaint: playback speed ("x16"); cluster phases: the cluster mode; otherwise null. */
  variant: string | null;
  /** v2: canvas variant measured (absent in v1 = baseline). */
  canvasVariant?: CanvasVariant;
  /** v2: links in the data handed to the canvas and links actually drawn (0 when links are off). */
  links?: { inData: number; drawn: number };
  /** v2: layout / cluster-layout only — the interval excluded before the window. */
  lead?: LeadWindow | null;
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
    /** v2. */
    breakdown?: RepaintBreakdown | null;
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
  /**
   * v2: layout phase → first frame Cosmograph drew with the data (its first simulation tick):
   * the data upload. Part of `layoutMs`.
   */
  uploadMs?: number | null;
  /** v2: long tasks during the upload (count, total ms) and its longest frame. */
  uploadLongTasks?: number | null;
  uploadLongTaskMs?: number | null;
  uploadMaxFrameMs?: number | null;
  /** First step start → frozen. */
  totalMs: number | null;
  /** Real run: how many topology downloads ran for this network (2 = a concurrent duplicate). */
  topologyFetches: number | null;
  /**
   * Real run: topology loads of this network served without a download — joined the one in
   * flight or reused a completed one (#140).
   */
  topologyShared?: number | null;
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
  /** v2: WebGL renderer of the context the canvas drew with (the GPU actually used). */
  canvasRenderer?: string | null;
  /** v2: canvas / Cosmograph lifecycle events, ms after the scenario's load started. */
  timeline?: Array<{ event: string; atMs: number }>;
  /** v2: loads of variants that remount the canvas (one-link-per-pair), with their link count. */
  variantLoads?: Partial<Record<CanvasVariant, LoadTimings & { links: number }>>;
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
  /** Written as BENCH_SCHEMA_VERSION; files of every SUPPORTED_SCHEMA_VERSIONS are read. */
  schemaVersion: number;
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
  if (
    typeof raw.schemaVersion !== "number" ||
    !SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)
  ) {
    return {
      ok: false,
      error: `unsupported schemaVersion ${String(raw.schemaVersion)} (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`,
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
  topologyShared: null,
};

/** File name stem: date, time and commit, e.g. `bench-2026-10-19T20-15-03-ed59e82`. */
export function resultFileStem(doc: Pick<BenchResultDocument, "kind" | "startedAt" | "build">) {
  const stamp = doc.startedAt.replace(/\.\d+Z$/, "").replace(/:/g, "-");
  const prefix = doc.kind === "suite" ? "bench" : "hud";
  return `${prefix}-${stamp}-${doc.build.gitCommit.slice(0, 7)}`;
}

/**
 * A unique id for a result document: `crypto.randomUUID()`, or random words from
 * `crypto.getRandomValues()` where randomUUID is missing (it needs a secure context).
 */
export function newResultId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const words = c.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${Array.from(words, (w) => w.toString(36)).join("")}`;
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
