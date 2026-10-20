import type { TopologyResponse } from "@/shared/api/backend";
import {
  type BenchCanvasHandle,
  type BenchProbeEvent,
  getBenchCanvas,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import type { UaMemoryResult } from "../lib/environment";
import type { FrameRecorder, PhaseRecording } from "../lib/frame-recorder";
import { estimateGpuMemory } from "../lib/gpu-estimate";
import { applyInteractionStep, buildInteractionScript } from "../lib/interaction-script";
import { deriveLoadTimings } from "../lib/load-timings";
import { toPhaseResult } from "../lib/phase-result";
import { deriveSeed } from "../lib/prng";
import {
  EMPTY_LOAD_TIMINGS,
  type LoadTimings,
  type PhaseResult,
  type ScenarioResult,
} from "../lib/result-schema";
import { type BenchRuntime, isAbortError } from "../lib/runtime";
import {
  type CanvasTimings,
  CLUSTER_SETTLE_MARGIN_MS,
  expandMatrix,
  PREWARM_SPEC,
  type ScenarioSpec,
  type SuiteConfig,
} from "../lib/suite-config";
import { buildSyntheticFramesChunk, pingPongRound } from "../lib/synthetic-rounds";
import {
  generateSyntheticTopology,
  syntheticNetworkId,
  syntheticRunId,
} from "../lib/synthetic-topology";

/**
 * Benchmark suite runner (#126). For every scenario of the matrix it generates a seeded
 * network, hands it to the REAL SimulationCanvas through the page's stage, waits for the
 * canvas to freeze (load phase, with the layout phase recorded while it runs), then measures
 * the selected phases: frozen idle, scripted interaction, per-round repaint at each playback
 * speed, and clustering (transition, idle, interaction). The canvas is disposed between
 * scenarios, followed by a settle pause.
 */

/** What the page provides: the real canvas, mounted with the given topology. */
export interface BenchStage {
  /** Renders a fresh SimulationCanvas for `topology` (a new instance per scenario). */
  mount(topology: TopologyResponse, scenarioId: string): void;
  /** Removes the canvas and resets the simulation store. */
  unmount(): void;
  /** The canvas `playbackActive` prop (true while rounds auto-advance, like the engine). */
  setPlaybackActive(active: boolean): void;
  /** Pushes a frame to the store — the playback engine's `updateFrame`. */
  showFrame(frame: MergedFrame): void;
  /** Canvas size in CSS px. */
  size(): { width: number; height: number };
}

export interface SuiteRunnerDeps {
  stage: BenchStage;
  /** Indexes a frames body and returns a merger of one round (the replay's chunk path). */
  openFrames(chunk: ArrayBuffer, agents: number): (round: number) => MergedFrame | null;
  runtime: BenchRuntime;
  createRecorder(): FrameRecorder;
  measureUaMemory(timeoutMs: number): Promise<UaMemoryResult>;
  canvasTimings: CanvasTimings;
  /** Rounds per second at ×1 (the playback engine's BASE_RPS). */
  playbackBaseRps: number;
  refreshIntervalMs: number | null;
  devicePixelRatio: number;
  /** `globalThis.gc` when exposed (Chrome --js-flags=--expose-gc). */
  gc: (() => void) | null;
  /** Probe access (defaults to the shared bench probe). */
  subscribe?: typeof subscribeBenchProbe;
  getCanvas?: () => BenchCanvasHandle | null;
}

export interface SuiteProgress {
  scenario: ScenarioSpec;
  index: number;
  total: number;
  step: string;
}

export interface SuiteCallbacks {
  onProgress?: (progress: SuiteProgress) => void;
  onScenarioDone?: (result: ScenarioResult) => void;
  /** The unmeasured pre-warm load (see `SuiteConfig.prewarm`). */
  onPrewarm?: (result: ScenarioResult) => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // marks are optional
  }
}

function measureBetween(name: string, start: string, end: string): void {
  try {
    performance.measure(name, start, end);
  } catch {
    // measures are optional
  }
}

class ScenarioError extends Error {}

/** Longest wait for `measureUserAgentSpecificMemory` (cross-origin isolated pages only). */
const UA_MEMORY_TIMEOUT_MS = 10_000;

/** Runs one measured window (warm-up first); `driver` runs from the warm-up start. */
async function measurePhase(
  deps: SuiteRunnerDeps,
  config: SuiteConfig,
  signal: AbortSignal,
  options: {
    phase: PhaseResult["phase"];
    variant?: string | null;
    warmupMs?: number;
    measureMs?: number;
    driver?: { start(): void; stop(): void; count?(): number } | null;
    uaMemory?: boolean;
    repaintSpeed?: number;
  },
): Promise<PhaseResult> {
  const warmupMs = options.warmupMs ?? config.warmupMs;
  const measureMs = options.measureMs ?? config.measureMs;
  const recorder = deps.createRecorder();
  const driver = options.driver ?? null;
  let recording: PhaseRecording | null = null;
  try {
    driver?.start();
    await deps.runtime.sleep(warmupMs, signal);
    const before = driver?.count?.() ?? 0;
    recorder.start();
    await deps.runtime.sleep(measureMs, signal);
    recording = recorder.stop();
    const rendered = (driver?.count?.() ?? 0) - before;
    // After the window: the browser answers on its next GC, which must not land in the window.
    const uaMemory = options.uaMemory ? await deps.measureUaMemory(UA_MEMORY_TIMEOUT_MS) : null;
    return toPhaseResult({
      phase: options.phase,
      variant: options.variant ?? null,
      warmupMs,
      measureMs,
      recording,
      refreshIntervalMs: deps.refreshIntervalMs,
      uaMemory,
      repaint:
        options.repaintSpeed !== undefined
          ? { speed: options.repaintSpeed, baseRps: deps.playbackBaseRps, roundsRendered: rendered }
          : null,
    });
  } finally {
    if (recording === null && recorder.running) recorder.stop();
    driver?.stop();
  }
}

/** The scripted camera path, re-armed on its absolute schedule (no drift). */
function interactionDriver(
  deps: SuiteRunnerDeps,
  canvas: BenchCanvasHandle,
  seed: number,
  points: number,
  stepMs: number,
) {
  const script = buildInteractionScript(seed, points, 600);
  let stopped = true;
  let timer: AbortController | null = null;
  return {
    start() {
      stopped = false;
      timer = new AbortController();
      const ctrl = timer;
      const t0 = deps.runtime.now();
      void (async () => {
        for (let k = 0; !stopped; k++) {
          const cosmograph = canvas.getCosmograph();
          const step = script[k % script.length];
          if (cosmograph && step) applyInteractionStep(cosmograph, step);
          try {
            await deps.runtime.sleep(t0 + (k + 1) * stepMs - deps.runtime.now(), ctrl.signal);
          } catch {
            return;
          }
        }
      })();
    },
    stop() {
      stopped = true;
      timer?.abort();
      canvas.getCosmograph()?.fitView(0);
    },
  };
}

/** Mirrors the playback engine's rAF driver: playhead += dt × BASE_RPS × speed, render floor(). */
function playbackDriver(
  deps: SuiteRunnerDeps,
  speed: number,
  ringRounds: number,
  frameAt: (round: number) => MergedFrame | null,
) {
  let handle: number | null = null;
  let playhead = 0;
  let last: number | null = null;
  let rendered = -1;
  let renders = 0;
  const step = (ts: number) => {
    handle = deps.runtime.requestFrame(step);
    if (last !== null) playhead += ((ts - last) / 1000) * deps.playbackBaseRps * speed;
    last = ts;
    const target = Math.floor(playhead);
    if (target !== rendered) {
      const frame = frameAt(pingPongRound(target, ringRounds));
      if (frame !== null) deps.stage.showFrame(frame);
      rendered = target;
      renders++;
    }
  };
  return {
    start() {
      deps.stage.setPlaybackActive(true);
      handle = deps.runtime.requestFrame(step);
    },
    stop() {
      if (handle !== null) deps.runtime.cancelFrame(handle);
      handle = null;
      deps.stage.setPlaybackActive(false);
    },
    count: () => renders,
  };
}

export async function runScenario(
  spec: ScenarioSpec,
  config: SuiteConfig,
  deps: SuiteRunnerDeps,
  signal: AbortSignal,
  report: (step: string) => void = () => {},
): Promise<ScenarioResult> {
  const { runtime, stage } = deps;
  const subscribe = deps.subscribe ?? subscribeBenchProbe;
  const getCanvas = deps.getCanvas ?? getBenchCanvas;
  const has = (g: SuiteConfig["phases"][number]) => config.phases.includes(g);

  const seed = deriveSeed(config.seed, spec.agents, spec.density);
  const runId = syntheticRunId(seed);
  const networkId = syntheticNetworkId(seed);
  const result: ScenarioResult = {
    id: spec.id,
    source: "synthetic",
    agents: spec.agents,
    edges: 0,
    density: spec.density,
    repetition: spec.repetition,
    seed,
    runId,
    networkId,
    status: "ok",
    error: null,
    stage: { width: 0, height: 0, devicePixelRatio: deps.devicePixelRatio },
    load: { ...EMPTY_LOAD_TIMINGS },
    gpuMemoryEstimate: null,
    forcedGc: false,
    phases: [],
  };

  const events: BenchProbeEvent[] = [];
  let layoutRecorder: FrameRecorder | null = null;
  let layoutRecording: PhaseRecording | null = null;
  const settled = deferred<"frozen" | "error">();
  const unsubscribe = subscribe((event) => {
    if (event.detail.networkId !== networkId) return;
    events.push(event);
    if (event.name === "canvas-layout-start" && has("layout") && layoutRecorder === null) {
      layoutRecorder = deps.createRecorder();
      layoutRecorder.start();
    }
    if (event.name === "canvas-frozen" || event.name === "canvas-error") {
      if (layoutRecorder?.running) layoutRecording = layoutRecorder.stop();
      settled.resolve(event.name === "canvas-frozen" ? "frozen" : "error");
    }
  });

  const prefix = `bench:${spec.id}`;
  try {
    report("settle");
    stage.unmount();
    await runtime.sleep(config.settleMs, signal);
    if (deps.gc) {
      deps.gc();
      result.forcedGc = true;
    }
    const size = stage.size();
    result.stage = { ...size, devicePixelRatio: deps.devicePixelRatio };

    // ── Load: generate → parse → (canvas) topologyToData → prepare → mount → layout ──
    report("load");
    const generateStart = runtime.now();
    mark(`${prefix}:generate:start`);
    const generated = generateSyntheticTopology({
      agents: spec.agents,
      density: spec.density,
      seed,
      runId,
      networkId,
    });
    mark(`${prefix}:generate:end`);
    const generateEnd = runtime.now();
    measureBetween(`${prefix}:generate`, `${prefix}:generate:start`, `${prefix}:generate:end`);
    result.edges = generated.edges.length;

    // JSON round trip: the real path parses the topology out of HTTP responses.
    let json: string | null = JSON.stringify(generated);
    mark(`${prefix}:parse:start`);
    const parseStart = runtime.now();
    const topology = JSON.parse(json) as TopologyResponse;
    const parseEnd = runtime.now();
    mark(`${prefix}:parse:end`);
    measureBetween(`${prefix}:parse`, `${prefix}:parse:start`, `${prefix}:parse:end`);
    json = null;

    // Playback rounds (outside the load timings: the real app fetches them as chunks later).
    const frameAt = has("repaint")
      ? deps.openFrames(
          buildSyntheticFramesChunk({
            runId,
            networkId,
            initialBeliefs: topology.agents.map((a) => a.initialBelief),
            rounds: config.ringRounds,
            seed: deriveSeed(seed, 1),
          }),
          spec.agents,
        )
      : null;

    stage.mount(topology, spec.id);
    const outcome = await Promise.race([
      settled.promise,
      runtime.sleep(config.loadTimeoutMs, signal).then(() => "timeout" as const),
    ]);
    const timings = deriveLoadTimings(events, runId, networkId);
    const frozenAt = events.find((e) => e.name === "canvas-frozen")?.at;
    const load: LoadTimings = {
      ...timings,
      generateMs: generateEnd - generateStart,
      parseMs: parseEnd - parseStart,
      totalMs: frozenAt !== undefined ? frozenAt - generateStart : null,
    };
    result.load = load;
    if (outcome === "timeout") {
      throw new ScenarioError(
        `canvas did not freeze within ${Math.round(config.loadTimeoutMs / 1000)} s`,
      );
    }
    if (outcome === "error") throw new ScenarioError("canvas reported a data-prep error");
    measureBetween(`${prefix}:load`, `${prefix}:generate:start`, "bench:canvas-frozen");

    if (layoutRecording !== null && has("layout")) {
      result.phases.push(
        toPhaseResult({
          phase: "layout",
          warmupMs: 0,
          measureMs: deps.canvasTimings.layoutMs,
          recording: layoutRecording,
          refreshIntervalMs: deps.refreshIntervalMs,
        }),
      );
    }

    const canvas = getCanvas();
    if (canvas === null || canvas.networkId !== networkId) {
      throw new ScenarioError("canvas handle not registered for this network");
    }
    result.gpuMemoryEstimate = estimateGpuMemory({
      points: spec.agents,
      links: result.edges,
      clustering: false,
      canvasWidth: size.width,
      canvasHeight: size.height,
      devicePixelRatio: deps.devicePixelRatio,
    });

    const interaction = () =>
      interactionDriver(deps, canvas, deriveSeed(seed, 2), spec.agents, config.interactionStepMs);

    if (has("idle")) {
      report("idle");
      result.phases.push(
        await measurePhase(deps, config, signal, { phase: "idle", uaMemory: true }),
      );
    }
    if (has("interaction")) {
      report("interaction");
      result.phases.push(
        await measurePhase(deps, config, signal, { phase: "interaction", driver: interaction() }),
      );
    }
    if (has("repaint") && frameAt !== null) {
      for (const speed of config.repaintSpeeds) {
        report(`repaint x${speed}`);
        result.phases.push(
          await measurePhase(deps, config, signal, {
            phase: "repaint",
            variant: `x${speed}`,
            driver: playbackDriver(deps, speed, config.ringRounds, frameAt),
            repaintSpeed: speed,
          }),
        );
      }
    }
    if (has("cluster")) {
      const mode = config.clusterMode;
      report(`cluster ${mode}`);
      canvas.setClusterMode(mode);
      result.phases.push(
        await measurePhase(deps, config, signal, {
          phase: "cluster-layout",
          variant: mode,
          warmupMs: 0,
          measureMs: deps.canvasTimings.clusterMs + CLUSTER_SETTLE_MARGIN_MS,
        }),
      );
      result.phases.push(
        await measurePhase(deps, config, signal, { phase: "cluster-idle", variant: mode }),
      );
      result.phases.push(
        await measurePhase(deps, config, signal, {
          phase: "cluster-interaction",
          variant: mode,
          driver: interaction(),
        }),
      );
      canvas.setClusterMode(null);
      await runtime.sleep(deps.canvasTimings.declusterMs + CLUSTER_SETTLE_MARGIN_MS, signal);
    }
  } catch (error) {
    if (isAbortError(error)) {
      result.status = "aborted";
      result.error = "aborted";
    } else {
      result.status = "error";
      result.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    unsubscribe();
    const pending = layoutRecorder as FrameRecorder | null;
    if (pending?.running) pending.stop();
    stage.unmount();
  }
  return result;
}

/** Runs the whole matrix in order; stops at the first abort. */
export async function runSuite(
  config: SuiteConfig,
  deps: SuiteRunnerDeps,
  signal: AbortSignal,
  callbacks: SuiteCallbacks = {},
): Promise<ScenarioResult[]> {
  const specs = expandMatrix(config);
  const results: ScenarioResult[] = [];
  if (config.prewarm) {
    const prewarm = await runScenario(
      PREWARM_SPEC,
      { ...config, phases: [] },
      deps,
      signal,
      (step) =>
        callbacks.onProgress?.({ scenario: PREWARM_SPEC, index: -1, total: specs.length, step }),
    );
    callbacks.onPrewarm?.(prewarm);
    if (prewarm.status === "aborted") return results;
  }
  for (const [index, spec] of specs.entries()) {
    if (signal.aborted) break;
    const result = await runScenario(spec, config, deps, signal, (step) =>
      callbacks.onProgress?.({ scenario: spec, index, total: specs.length, step }),
    );
    results.push(result);
    callbacks.onScenarioDone?.(result);
    if (result.status === "aborted") break;
  }
  return results;
}
