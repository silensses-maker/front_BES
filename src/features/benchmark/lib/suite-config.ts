/**
 * Benchmark suite configuration, scenario matrix and duration estimate (#126).
 *
 * Default matrix: 10k, 25k, 50k, 100k agents plus 150k as the stress tier, × densities 2, 3, 5:
 * - 2 is the wizard's minimum (`density ≥ 2`) and the default template's density;
 * - 3 is the second template's density and the only prior manual measurement (100k, density 3);
 * - 5 is a dense case: 2·m·n ≈ 1M directed edges at 100k agents (1.5M at 150k), which bounds
 *   the link-rendering cost.
 * At these sizes only Administrators can create runs (densityFactor 1.0), so the requested
 * density is the effective density.
 */

export const PHASE_GROUPS = ["layout", "idle", "interaction", "repaint", "cluster"] as const;
export type PhaseGroup = (typeof PHASE_GROUPS)[number];

export const CLUSTER_MODES = ["strategy", "effect", "belief"] as const;
export type SuiteClusterMode = (typeof CLUSTER_MODES)[number];

export const PLAYBACK_SPEED_OPTIONS = [1, 4, 16, 64] as const;

export const DEFAULT_SIZES = [10_000, 25_000, 50_000, 100_000, 150_000] as const;
export const DEFAULT_DENSITIES = [2, 3, 5] as const;

export interface SuiteConfig {
  sizes: number[];
  densities: number[];
  repetitions: number;
  /** Warm-up before each measured window (ms). */
  warmupMs: number;
  /** Measured window of each phase (ms). */
  measureMs: number;
  /** Pause after disposing a scenario, before the next one starts (ms). */
  settleMs: number;
  phases: PhaseGroup[];
  /** Playback speeds of the repaint phase (×1 = 10 rounds/s, the app's BASE_RPS). */
  repaintSpeeds: number[];
  clusterMode: SuiteClusterMode;
  seed: number;
  /** Canvas size in CSS px; "fill" uses the whole viewport below the toolbar. */
  stage: { width: number; height: number } | "fill";
  /** Rounds stored for playback (played ping-pong). */
  ringRounds: number;
  /** Period of the scripted camera moves (ms). */
  interactionStepMs: number;
  /** Give up on a scenario whose canvas has not frozen after this long (ms). */
  loadTimeoutMs: number;
  /**
   * Load one small unmeasured network first: the first `prepareCosmographData` of a page also
   * downloads and compiles DuckDB-WASM, which would inflate the first scenario's load.
   */
  prewarm: boolean;
}

export const DEFAULT_SUITE_CONFIG: SuiteConfig = {
  sizes: [...DEFAULT_SIZES],
  densities: [...DEFAULT_DENSITIES],
  repetitions: 3,
  warmupMs: 2_000,
  measureMs: 10_000,
  settleMs: 2_000,
  phases: [...PHASE_GROUPS],
  repaintSpeeds: [1, 16],
  clusterMode: "strategy",
  seed: 126,
  stage: { width: 1280, height: 720 },
  ringRounds: 32,
  interactionStepMs: 1_000,
  loadTimeoutMs: 180_000,
  prewarm: true,
};

/** The unmeasured pre-warm network (see `SuiteConfig.prewarm`). */
export const PREWARM_SPEC: ScenarioSpec = {
  id: "prewarm-n500-d2",
  agents: 500,
  density: 2,
  repetition: 0,
  order: -1,
};

export interface ScenarioSpec {
  id: string;
  agents: number;
  density: number;
  repetition: number;
  /** Position in the run order (0-based). */
  order: number;
}

/**
 * The run order is repetition-major (every size × density once, then again…): repetitions are
 * spread over the whole run so slow drifts (thermal throttling, background work) do not land
 * on one scenario.
 */
export function expandMatrix(config: SuiteConfig): ScenarioSpec[] {
  const out: ScenarioSpec[] = [];
  const sizes = [...new Set(config.sizes)].sort((a, b) => a - b);
  const densities = [...new Set(config.densities)].sort((a, b) => a - b);
  for (let r = 1; r <= config.repetitions; r++) {
    for (const agents of sizes) {
      for (const density of densities) {
        if (density >= agents) continue;
        out.push({
          id: `n${agents}-d${density}-r${r}`,
          agents,
          density,
          repetition: r,
          order: out.length,
        });
      }
    }
  }
  return out;
}

export interface CanvasTimings {
  /** SimulationCanvas LAYOUT_DURATION_MS. */
  layoutMs: number;
  /** SimulationCanvas CLUSTER_REANIMATE_MS. */
  clusterMs: number;
  /** SimulationCanvas DECLUSTER_PLAY_DELAY_MS. */
  declusterMs: number;
}

/** Extra wait after a cluster transition before measuring (ms). */
export const CLUSTER_SETTLE_MARGIN_MS = 500;

/** Rough generate + prepare + mount cost (ms): a planning figure, not a measurement. */
export function estimateLoadMs(agents: number, density: number): number {
  const links = 2 * density * agents;
  return 1_500 + 0.01 * (agents + links);
}

/** Estimated wall time of one scenario (ms). */
export function estimateScenarioMs(
  spec: Pick<ScenarioSpec, "agents" | "density">,
  config: SuiteConfig,
  timings: CanvasTimings,
): number {
  const phase = config.warmupMs + config.measureMs;
  const has = (g: PhaseGroup) => config.phases.includes(g);
  let ms = config.settleMs + estimateLoadMs(spec.agents, spec.density) + timings.layoutMs;
  if (has("idle")) ms += phase;
  if (has("interaction")) ms += phase;
  if (has("repaint")) ms += phase * config.repaintSpeeds.length;
  if (has("cluster")) {
    ms += timings.clusterMs + CLUSTER_SETTLE_MARGIN_MS + 2 * phase;
    ms += timings.declusterMs + CLUSTER_SETTLE_MARGIN_MS;
  }
  return ms;
}

export function estimateSuiteMs(config: SuiteConfig, timings: CanvasTimings): number {
  const prewarm = config.prewarm
    ? estimateScenarioMs(PREWARM_SPEC, { ...config, phases: [] }, timings)
    : 0;
  return expandMatrix(config).reduce(
    (sum, s) => sum + estimateScenarioMs(s, config, timings),
    prewarm,
  );
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

export function validateSuiteConfig(config: SuiteConfig): string[] {
  const errors: string[] = [];
  const positiveInts = (values: number[]) => values.every((v) => Number.isInteger(v) && v > 0);
  if (config.sizes.length === 0 || !positiveInts(config.sizes)) {
    errors.push("Select at least one network size (positive integers).");
  }
  if (config.densities.length === 0 || !positiveInts(config.densities)) {
    errors.push("Select at least one density (positive integers).");
  }
  if (!Number.isInteger(config.repetitions) || config.repetitions < 1) {
    errors.push("Repetitions must be an integer >= 1.");
  }
  if (!(config.measureMs > 0)) errors.push("The measured window must be > 0 ms.");
  if (!(config.warmupMs >= 0) || !(config.settleMs >= 0)) {
    errors.push("Warm-up and settle times must be >= 0 ms.");
  }
  if (config.phases.length === 0) errors.push("Select at least one phase.");
  if (config.phases.includes("repaint") && config.repaintSpeeds.length === 0) {
    errors.push("Select at least one playback speed for the repaint phase.");
  }
  if (!Number.isInteger(config.seed)) errors.push("The seed must be an integer.");
  if (config.sizes.length > 0 && config.densities.length > 0 && expandMatrix(config).length === 0) {
    errors.push("No scenario left: every density must be lower than the network size.");
  }
  return errors;
}

// ─── URL query (reproducible links + automation) ───────────────────────────────

const numberList = (raw: string | null): number[] | null => {
  if (raw === null || raw.trim() === "") return null;
  const values = raw.split(",").map((part) => {
    const t = part.trim().toLowerCase();
    const k = t.endsWith("k") ? 1_000 : 1;
    return Math.round(Number(k === 1 ? t : t.slice(0, -1)) * k);
  });
  return values.every((v) => Number.isFinite(v)) ? values : null;
};

const seconds = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.round(v * 1000) : null;
};

/**
 * Overrides from the query string, e.g.
 * `/bench?sizes=10k,25k&densities=3&reps=1&warmup=2&measure=10&phases=idle,repaint&speeds=1,16
 * &cluster=strategy&seed=126&stage=1280x720&settle=2&autorun=1`. Times are in seconds.
 */
export function parseSuiteQuery(
  search: string,
  base: SuiteConfig = DEFAULT_SUITE_CONFIG,
): { config: SuiteConfig; autorun: boolean } {
  const q = new URLSearchParams(search);
  const config: SuiteConfig = { ...base, stage: base.stage };
  config.sizes = numberList(q.get("sizes")) ?? config.sizes;
  config.densities = numberList(q.get("densities")) ?? config.densities;
  const reps = numberList(q.get("reps"));
  if (reps?.[0] !== undefined) config.repetitions = reps[0];
  config.warmupMs = seconds(q.get("warmup")) ?? config.warmupMs;
  config.measureMs = seconds(q.get("measure")) ?? config.measureMs;
  config.settleMs = seconds(q.get("settle")) ?? config.settleMs;
  const phases = q.get("phases");
  if (phases !== null) {
    config.phases = phases
      .split(",")
      .map((p) => p.trim())
      .filter((p): p is PhaseGroup => (PHASE_GROUPS as readonly string[]).includes(p));
  }
  config.repaintSpeeds = numberList(q.get("speeds")) ?? config.repaintSpeeds;
  const cluster = q.get("cluster");
  if (cluster !== null && (CLUSTER_MODES as readonly string[]).includes(cluster)) {
    config.clusterMode = cluster as SuiteClusterMode;
  }
  const seed = numberList(q.get("seed"));
  if (seed?.[0] !== undefined) config.seed = seed[0];
  const stage = q.get("stage");
  if (stage === "fill") config.stage = "fill";
  else if (stage !== null) {
    const match = /^(\d+)x(\d+)$/.exec(stage);
    if (match) config.stage = { width: Number(match[1]), height: Number(match[2]) };
  }
  const ring = numberList(q.get("ring"));
  if (ring?.[0] !== undefined) config.ringRounds = ring[0];
  const prewarm = q.get("prewarm");
  if (prewarm === "0" || prewarm === "1") config.prewarm = prewarm === "1";
  return { config, autorun: q.get("autorun") === "1" };
}

/** The inverse of {@link parseSuiteQuery} (without autorun). */
export function suiteQuery(config: SuiteConfig): string {
  const q = new URLSearchParams();
  q.set("sizes", config.sizes.join(","));
  q.set("densities", config.densities.join(","));
  q.set("reps", String(config.repetitions));
  q.set("warmup", String(config.warmupMs / 1000));
  q.set("measure", String(config.measureMs / 1000));
  q.set("settle", String(config.settleMs / 1000));
  q.set("phases", config.phases.join(","));
  q.set("speeds", config.repaintSpeeds.join(","));
  q.set("cluster", config.clusterMode);
  q.set("seed", String(config.seed));
  q.set("stage", config.stage === "fill" ? "fill" : `${config.stage.width}x${config.stage.height}`);
  q.set("ring", String(config.ringRounds));
  q.set("prewarm", config.prewarm ? "1" : "0");
  return q.toString();
}
