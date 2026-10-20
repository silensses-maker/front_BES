import type { TopologyResponse } from "@/shared/api/backend";
import {
  type BenchCanvasHandle,
  type BenchProbeEvent,
  getBenchCanvas,
  HIGH_FREQUENCY_PROBES,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import type { UaMemoryResult } from "../lib/environment";
import { type FrameRecorder, type PhaseRecording, splitRecording } from "../lib/frame-recorder";
import { estimateGpuMemory } from "../lib/gpu-estimate";
import { applyInteractionStep, buildInteractionScript } from "../lib/interaction-script";
import { chooseWindowStart } from "../lib/layout-window";
import { deriveLoadTimings } from "../lib/load-timings";
import { toLeadWindow, toPhaseResult } from "../lib/phase-result";
import { deriveSeed } from "../lib/prng";
import { computeRepaintBreakdown, type RoundRecord } from "../lib/repaint-breakdown";
import {
  type CanvasVariant,
  EMPTY_LOAD_TIMINGS,
  type LeadWindow,
  type LoadTimings,
  type PhaseResult,
  type ScenarioResult,
} from "../lib/result-schema";
import { type BenchRuntime, isAbortError } from "../lib/runtime";
import {
  type CanvasTimings,
  CLUSTER_SETTLE_MARGIN_MS,
  expandMatrix,
  type PhaseGroup,
  PREWARM_SPEC,
  type ScenarioSpec,
  type SuiteConfig,
  VARIANT_SETTLE_MS,
  variantPhases,
} from "../lib/suite-config";
import { buildSyntheticFramesChunk, pingPongRound } from "../lib/synthetic-rounds";
import {
  generateSyntheticTopology,
  keepOneLinkPerPair,
  syntheticNetworkId,
  syntheticRunId,
} from "../lib/synthetic-topology";

/**
 * Benchmark suite runner (#126). For every scenario of the matrix it generates a seeded
 * network, hands it to the REAL SimulationCanvas through the page's stage and waits for the
 * canvas to freeze (load phase). The layout window starts at the first frame Cosmograph draws
 * with the data (its first simulation tick after the upload), not at the layout commit: the
 * upload before it is reported separately. Then it measures the selected phases — frozen idle,
 * scripted interaction, per-round repaint at each playback speed (with a per-round breakdown)
 * and clustering — and, when asked, the canvas variants of the LOD study. The canvas is
 * disposed between scenarios, followed by a settle pause.
 */

/** What the page provides: the real canvas, mounted with the given topology. */
export interface BenchStage {
  /** Renders a fresh SimulationCanvas for `topology` (a new instance per key). */
  mount(topology: TopologyResponse, key: string): void;
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

class ScenarioError extends Error {}

/** Longest wait for `measureUserAgentSpecificMemory` (cross-origin isolated pages only). */
const UA_MEMORY_TIMEOUT_MS = 10_000;
/** Longest wait for Cosmograph's in-flight updates before a variant switch or an unmount. */
const UPDATES_SETTLE_TIMEOUT_MS = 10_000;

/**
 * Lets Cosmograph finish the setConfig calls a playback left in flight: destroying the canvas
 * (or switching a variant) under them makes Cosmograph's async continuations throw.
 */
async function settleUpdates(
  deps: SuiteRunnerDeps,
  handle: BenchCanvasHandle | null,
  signal: AbortSignal,
): Promise<void> {
  if (handle === null) return;
  const deadline = deps.runtime.now() + UPDATES_SETTLE_TIMEOUT_MS;
  while (handle.pendingUpdates() > 0 && deps.runtime.now() < deadline) {
    await deps.runtime.sleep(50, signal);
  }
}
/** Lifecycle events kept in a scenario's timeline. */
const TIMELINE_LIMIT = 120;

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

/** The probe events of one scenario's network: kept, awaited, captured (high-frequency). */
class ScenarioEvents {
  readonly all: BenchProbeEvent[] = [];
  private capture: BenchProbeEvent[] | null = null;
  private readonly listeners = new Set<(event: BenchProbeEvent) => void>();
  private readonly networkId: string;

  constructor(networkId: string) {
    this.networkId = networkId;
  }

  push(event: BenchProbeEvent): void {
    if (event.detail.networkId !== this.networkId) return;
    if (HIGH_FREQUENCY_PROBES.includes(event.name)) {
      this.capture?.push(event);
      return;
    }
    this.all.push(event);
    for (const listener of this.listeners) listener(event);
  }

  on(listener: (event: BenchProbeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  startCapture(): void {
    this.capture = [];
  }

  stopCapture(): BenchProbeEvent[] {
    const out = this.capture ?? [];
    this.capture = null;
    return out;
  }

  since(at: number): BenchProbeEvent[] {
    return this.all.filter((e) => e.at >= at);
  }
}

interface MeasureOptions {
  phase: PhaseResult["phase"];
  variant?: string | null;
  canvasVariant: CanvasVariant;
  links: { inData: number; drawn: number };
  warmupMs?: number;
  measureMs?: number;
  driver?: Driver | null;
  uaMemory?: boolean;
  repaintSpeed?: number;
}

interface Driver {
  start(): void;
  stop(): void;
  /** Repaint driver: the rounds it pushed. */
  rounds?: () => RoundRecord[];
}

/** Runs one measured window (warm-up first); `driver` runs from the warm-up start. */
async function measurePhase(
  deps: SuiteRunnerDeps,
  config: SuiteConfig,
  events: ScenarioEvents,
  signal: AbortSignal,
  options: MeasureOptions,
): Promise<PhaseResult> {
  const warmupMs = options.warmupMs ?? config.warmupMs;
  const measureMs = options.measureMs ?? config.measureMs;
  const recorder = deps.createRecorder();
  const driver = options.driver ?? null;
  let recording: PhaseRecording | null = null;
  const breakdown = options.repaintSpeed !== undefined;
  try {
    driver?.start();
    await deps.runtime.sleep(warmupMs, signal);
    if (breakdown) events.startCapture();
    recorder.start();
    const windowStart = deps.runtime.now();
    await deps.runtime.sleep(measureMs, signal);
    const rec = recorder.stop();
    recording = rec;
    const captured = breakdown ? events.stopCapture() : [];
    const rounds = (driver?.rounds?.() ?? []).filter(
      (r) => r.showAt >= windowStart && r.showAt <= rec.endedAt,
    );
    // After the window: the browser answers on its next GC, which must not land in the window.
    const uaMemory = options.uaMemory ? await deps.measureUaMemory(UA_MEMORY_TIMEOUT_MS) : null;
    const deltas = rec.deltas;
    const meanFrame = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null;
    return toPhaseResult({
      phase: options.phase,
      variant: options.variant ?? null,
      canvasVariant: options.canvasVariant,
      links: options.links,
      warmupMs,
      measureMs,
      recording: rec,
      refreshIntervalMs: deps.refreshIntervalMs,
      uaMemory,
      repaint:
        options.repaintSpeed !== undefined
          ? {
              speed: options.repaintSpeed,
              baseRps: deps.playbackBaseRps,
              roundsRendered: rounds.length,
              breakdown: computeRepaintBreakdown({
                rounds,
                events: captured,
                windowStart: rec.startedAt,
                windowEnd: rec.endedAt,
                frameMs: meanFrame,
                longTaskMs: rec.longTasks.supported ? rec.longTasks.totalMs : null,
              }),
            }
          : null,
    });
  } finally {
    if (breakdown) events.stopCapture();
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
): Driver {
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
): Driver {
  let handle: number | null = null;
  let playhead = 0;
  let last: number | null = null;
  let rendered = -1;
  const records: RoundRecord[] = [];
  const step = (ts: number) => {
    handle = deps.runtime.requestFrame(step);
    if (last !== null) playhead += ((ts - last) / 1000) * deps.playbackBaseRps * speed;
    last = ts;
    const target = Math.floor(playhead);
    if (target !== rendered) {
      const mergeStart = deps.runtime.now();
      const frame = frameAt(pingPongRound(target, ringRounds));
      const showAt = deps.runtime.now();
      if (frame !== null) {
        deps.stage.showFrame(frame);
        records.push({ round: frame.round, showAt, mergeMs: showAt - mergeStart });
      }
      rendered = target;
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
    rounds: () => records,
  };
}

interface LoadedNetwork {
  /** Load timings of this mount (from the canvas probe events). */
  timings: LoadTimings;
  /** The layout window (starts at the first frame drawn with the data); null if not recorded. */
  layout: { recording: PhaseRecording; lead: LeadWindow } | null;
}

/**
 * Mounts `topology` and waits until the canvas freezes. When `recordLayout` is set, the frames
 * from the layout commit to the freeze are recorded and split at the first frame Cosmograph drew
 * with the data (see chooseWindowStart): before it is the upload, after it the layout window.
 */
async function loadOnStage(
  deps: SuiteRunnerDeps,
  config: SuiteConfig,
  events: ScenarioEvents,
  signal: AbortSignal,
  topology: TopologyResponse,
  key: string,
  recordLayout: boolean,
): Promise<LoadedNetwork> {
  const mountedAt = deps.runtime.now();
  let recorder: FrameRecorder | null = null;
  let recording: PhaseRecording | null = null;
  let settle: (outcome: "frozen" | "error") => void = () => {};
  const settled = new Promise<"frozen" | "error">((resolve) => {
    settle = resolve;
  });
  const off = events.on((event) => {
    if (event.at < mountedAt) return;
    if (event.name === "canvas-layout-start" && recordLayout && recorder === null) {
      recorder = deps.createRecorder();
      recorder.start();
    }
    if (event.name === "canvas-frozen" || event.name === "canvas-error") {
      const active = recorder as FrameRecorder | null;
      if (active?.running) recording = active.stop();
      settle(event.name === "canvas-frozen" ? "frozen" : "error");
    }
  });
  try {
    deps.stage.mount(topology, key);
    const outcome = await Promise.race([
      settled,
      deps.runtime.sleep(config.loadTimeoutMs, signal).then(() => "timeout" as const),
    ]);
    const mine = events.since(mountedAt);
    const timings = deriveLoadTimings(mine, topology.runId, topology.networkId);
    if (outcome === "timeout") {
      throw new ScenarioError(
        `canvas did not freeze within ${Math.round(config.loadTimeoutMs / 1000)} s`,
      );
    }
    if (outcome === "error") throw new ScenarioError("canvas reported a data-prep error");

    const layoutStart = mine.find((e) => e.name === "canvas-layout-start")?.at;
    const frozenAt = mine.find((e) => e.name === "canvas-frozen")?.at;
    const firstFrame =
      layoutStart !== undefined && frozenAt !== undefined
        ? chooseWindowStart(mine, {
            from: layoutStart,
            to: frozenAt,
            dataEvents: ["cosmograph-graph-rebuilt"],
          })
        : null;
    const rec = recording as PhaseRecording | null;
    let layout: LoadedNetwork["layout"] = null;
    if (rec !== null) {
      if (firstFrame !== null) {
        const { lead, main } = splitRecording(rec, firstFrame);
        layout = { recording: main, lead: toLeadWindow("upload", lead, "first-tick") };
      } else {
        const empty = splitRecording(rec, rec.startedAt).lead;
        layout = { recording: rec, lead: toLeadWindow("upload", empty, "fallback") };
      }
    }
    return {
      timings: {
        ...timings,
        uploadMs:
          firstFrame !== null && layoutStart !== undefined ? firstFrame - layoutStart : null,
        uploadLongTasks:
          layout !== null && layout.lead.longTasks.supported ? layout.lead.longTasks.count : null,
        uploadLongTaskMs:
          layout !== null && layout.lead.longTasks.supported ? layout.lead.longTasks.totalMs : null,
        uploadMaxFrameMs: layout?.lead.maxFrameMs ?? null,
      },
      layout,
    };
  } finally {
    off();
    const active = recorder as FrameRecorder | null;
    if (active?.running) active.stop();
  }
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
  const has = (g: PhaseGroup) => config.phases.includes(g);

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
    canvasRenderer: null,
    timeline: [],
  };

  const events = new ScenarioEvents(networkId);
  const unsubscribe = subscribe((event) => events.push(event));
  const prefix = `bench:${spec.id}`;
  let generateStart = runtime.now();
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

    // ── Load: generate → parse → (canvas) topologyToData → prepare → mount → upload → layout ──
    report("load");
    generateStart = runtime.now();
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
    const needsRounds = has("repaint") && config.repaintSpeeds.length > 0;
    const frameAt = needsRounds
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

    const syntheticSteps = () => {
      const frozenAt = events.all.find((e) => e.name === "canvas-frozen")?.at;
      return {
        generateMs: generateEnd - generateStart,
        parseMs: parseEnd - parseStart,
        totalMs: frozenAt !== undefined ? frozenAt - generateStart : null,
      };
    };
    let loaded: LoadedNetwork;
    try {
      loaded = await loadOnStage(deps, config, events, signal, topology, spec.id, has("layout"));
    } catch (error) {
      result.load = { ...deriveLoadTimings(events.all, runId, networkId), ...syntheticSteps() };
      throw error;
    }
    result.load = { ...loaded.timings, ...syntheticSteps() };
    measureBetween(`${prefix}:load`, `${prefix}:generate:start`, "bench:canvas-frozen");

    const links = { inData: result.edges, drawn: result.edges };
    if (loaded.layout !== null && has("layout")) {
      result.phases.push(
        toPhaseResult({
          phase: "layout",
          canvasVariant: "baseline",
          links,
          warmupMs: 0,
          measureMs: deps.canvasTimings.layoutMs,
          recording: loaded.layout.recording,
          refreshIntervalMs: deps.refreshIntervalMs,
          lead: loaded.layout.lead,
        }),
      );
    }

    const canvas = getCanvas();
    if (canvas === null || canvas.networkId !== networkId) {
      throw new ScenarioError("canvas handle not registered for this network");
    }
    result.canvasRenderer = canvas.getRenderer();
    result.gpuMemoryEstimate = estimateGpuMemory({
      points: spec.agents,
      links: result.edges,
      clustering: false,
      canvasWidth: size.width,
      canvasHeight: size.height,
      devicePixelRatio: deps.devicePixelRatio,
    });

    const interaction = (handle: BenchCanvasHandle) =>
      interactionDriver(deps, handle, deriveSeed(seed, 2), spec.agents, config.interactionStepMs);
    const measure = (options: MeasureOptions) =>
      measurePhase(deps, config, events, signal, options);

    if (has("idle")) {
      report("idle");
      result.phases.push(
        await measure({ phase: "idle", canvasVariant: "baseline", links, uaMemory: true }),
      );
    }
    if (has("interaction")) {
      report("interaction");
      result.phases.push(
        await measure({
          phase: "interaction",
          canvasVariant: "baseline",
          links,
          driver: interaction(canvas),
        }),
      );
    }
    if (frameAt !== null) {
      for (const speed of config.repaintSpeeds) {
        report(`repaint x${speed}`);
        result.phases.push(
          await measure({
            phase: "repaint",
            variant: `x${speed}`,
            canvasVariant: "baseline",
            links,
            driver: playbackDriver(deps, speed, config.ringRounds, frameAt),
            repaintSpeed: speed,
          }),
        );
        await settleUpdates(deps, canvas, signal);
      }
    }
    if (has("cluster")) {
      const mode = config.clusterMode;
      report(`cluster ${mode}`);
      // Record from the grouping change; the window starts at the first frame drawn with the
      // clusters and ends when the product re-freezes (CLUSTER_REANIMATE_MS after the change).
      const recorder = deps.createRecorder();
      recorder.start();
      const changedAt = runtime.now();
      canvas.setClusterMode(mode);
      let transition: PhaseRecording;
      try {
        await runtime.sleep(deps.canvasTimings.clusterMs, signal);
      } finally {
        transition = recorder.stop();
      }
      const firstFrame = chooseWindowStart(events.all, {
        from: changedAt,
        to: transition.endedAt,
        dataEvents: ["cosmograph-clusters-updated", "cosmograph-graph-rebuilt"],
      });
      const split =
        firstFrame !== null
          ? splitRecording(transition, firstFrame)
          : { lead: splitRecording(transition, transition.startedAt).lead, main: transition };
      result.phases.push(
        toPhaseResult({
          phase: "cluster-layout",
          variant: mode,
          canvasVariant: "baseline",
          links,
          warmupMs: 0,
          measureMs: deps.canvasTimings.clusterMs,
          recording: split.main,
          refreshIntervalMs: deps.refreshIntervalMs,
          lead: toLeadWindow(
            "cluster-update",
            split.lead,
            firstFrame !== null ? "first-tick" : "fallback",
          ),
        }),
      );
      await runtime.sleep(CLUSTER_SETTLE_MARGIN_MS, signal);
      result.phases.push(
        await measure({ phase: "cluster-idle", variant: mode, canvasVariant: "baseline", links }),
      );
      result.phases.push(
        await measure({
          phase: "cluster-interaction",
          variant: mode,
          canvasVariant: "baseline",
          links,
          driver: interaction(canvas),
        }),
      );
      canvas.setClusterMode(null);
      await runtime.sleep(deps.canvasTimings.declusterMs + CLUSTER_SETTLE_MARGIN_MS, signal);
    }

    // ── Canvas variants of the LOD study (#50) ──
    const vPhases = variantPhases(config);
    const measureVariant = async (
      handle: BenchCanvasHandle,
      canvasVariant: CanvasVariant,
      variantLinks: { inData: number; drawn: number },
    ) => {
      for (const g of vPhases) {
        report(`${canvasVariant} · ${g}`);
        if (g === "repaint") {
          const speed = config.repaintSpeeds[0] as number;
          if (frameAt === null) continue;
          result.phases.push(
            await measure({
              phase: "repaint",
              variant: `x${speed}`,
              canvasVariant,
              links: variantLinks,
              driver: playbackDriver(deps, speed, config.ringRounds, frameAt),
              repaintSpeed: speed,
            }),
          );
          await settleUpdates(deps, handle, signal);
        } else {
          result.phases.push(
            await measure({
              phase: g === "idle" ? "idle" : "interaction",
              canvasVariant,
              links: variantLinks,
              driver: g === "interaction" ? interaction(handle) : null,
            }),
          );
        }
      }
    };
    for (const variant of config.canvasVariants) {
      if (variant === "one-link-per-pair") continue;
      canvas.setOverlay(variant);
      await runtime.sleep(VARIANT_SETTLE_MS, signal);
      await measureVariant(canvas, variant, {
        inData: result.edges,
        drawn: variant === "links-off" ? 0 : result.edges,
      });
      canvas.setOverlay("baseline");
    }
    if (config.canvasVariants.includes("one-link-per-pair")) {
      report("one-link-per-pair · load");
      stage.unmount();
      await runtime.sleep(config.settleMs, signal);
      deps.gc?.();
      const pairs = keepOneLinkPerPair(topology);
      const reloaded = await loadOnStage(
        deps,
        config,
        events,
        signal,
        pairs,
        `${spec.id}:one-link-per-pair`,
        false,
      );
      result.variantLoads = {
        "one-link-per-pair": { ...reloaded.timings, links: pairs.edges.length },
      };
      const pairsCanvas = getCanvas();
      if (pairsCanvas === null || pairsCanvas.networkId !== networkId) {
        throw new ScenarioError("canvas handle not registered for the one-link-per-pair network");
      }
      await measureVariant(pairsCanvas, "one-link-per-pair", {
        inData: pairs.edges.length,
        drawn: pairs.edges.length,
      });
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
    result.timeline = events.all.slice(0, TIMELINE_LIMIT).map((e) => ({
      event: e.name,
      atMs: Math.round((e.at - generateStart) * 10) / 10,
    }));
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
      { ...config, phases: [], canvasVariants: [] },
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
