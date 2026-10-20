import type { BenchEnvironment } from "@/features/benchmark/lib/environment";
import { summarizeFrames } from "@/features/benchmark/lib/frame-stats";
import {
  BENCH_HARNESS_MARKER,
  BENCH_SCHEMA_VERSION,
  type BenchResultDocument,
  EMPTY_LOAD_TIMINGS,
  type PhaseResult,
  type ScenarioResult,
} from "@/features/benchmark/lib/result-schema";

/** Test fixtures for the benchmark harness (#126). */

export function fakeEnvironment(overrides: Partial<BenchEnvironment> = {}): BenchEnvironment {
  return {
    gpu: {
      source: "WEBGL_debug_renderer_info",
      webglVersion: 2,
      vendor: "NVIDIA Corporation",
      renderer: "NVIDIA GeForce RTX 3060",
      maxTextureSize: 16384,
      softwareRendering: false,
    },
    hardwareConcurrency: 12,
    deviceMemoryGb: 8,
    userAgent: "Mozilla/5.0 Chrome/130",
    userAgentData: {
      brands: ["Google Chrome 130", "Chromium 130"],
      mobile: false,
      platform: "Windows",
      fullVersionList: ["Google Chrome 130.0.6723.70"],
    },
    language: "en",
    timeZone: "America/Bogota",
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
    devicePixelRatio: 1,
    viewport: { width: 1900, height: 950 },
    refreshRateHzEst: 60,
    crossOriginIsolated: false,
    apis: { performanceMemory: true, measureUserAgentSpecificMemory: false, longTask: true },
    hostname: "localhost",
    webdriver: false,
    ...overrides,
  };
}

export function fakePhase(
  phase: PhaseResult["phase"],
  fps: number,
  extra: Partial<PhaseResult> = {},
): PhaseResult {
  return {
    phase,
    variant: null,
    warmupMs: 2_000,
    measureMs: 10_000,
    actualMs: 10_000,
    frames: summarizeFrames(new Array<number>(100).fill(1000 / fps), 1000 / 60),
    longTasks: { supported: true, count: 1, totalMs: 60, maxMs: 60 },
    heap: {
      supported: true,
      samples: 10,
      minBytes: 100 * 1024 * 1024,
      maxBytes: 200 * 1024 * 1024,
      endBytes: 150 * 1024 * 1024,
      totalEndBytes: 300 * 1024 * 1024,
      limitBytes: 4096 * 1024 * 1024,
    },
    uaMemory: null,
    repaint: null,
    ...extra,
  };
}

export function fakeScenario(
  agents: number,
  density: number,
  repetition: number,
  phases: PhaseResult[],
  extra: Partial<ScenarioResult> = {},
): ScenarioResult {
  return {
    id: `n${agents}-d${density}-r${repetition}`,
    source: "synthetic",
    agents,
    edges: density * (density - 1) + (agents - density) * 2 * density,
    density,
    repetition,
    seed: 42,
    runId: "1260000000042",
    networkId: "00000126-0000-4000-8000-00000000002a",
    status: "ok",
    error: null,
    stage: { width: 1280, height: 720, devicePixelRatio: 1 },
    load: { ...EMPTY_LOAD_TIMINGS, generateMs: 100 * repetition, parseMs: 50, totalMs: 6_000 },
    gpuMemoryEstimate: {
      kind: "estimate",
      totalBytes: 64 * 1024 * 1024,
      breakdown: {
        pointTextures: 0,
        linkTextures: 0,
        linkBuffers: 0,
        pointBuffers: 0,
        screenBuffers: 0,
      },
      model: "test",
    },
    forcedGc: false,
    phases,
    ...extra,
  };
}

export function fakeDocument(
  scenarios: ScenarioResult[],
  overrides: Partial<BenchResultDocument> = {},
): BenchResultDocument {
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    harness: BENCH_HARNESS_MARKER,
    kind: "suite",
    id: "doc-1",
    startedAt: "2026-10-19T20:15:03.123Z",
    finishedAt: "2026-10-19T21:15:03.123Z",
    complete: true,
    build: {
      mode: "production",
      appVersion: "2.0.13",
      gitCommit: "ed59e82abcde",
      gitDirty: false,
      builtAt: "2026-10-19T20:00:00.000Z",
    },
    environment: fakeEnvironment(),
    config: {},
    scenarios,
    warnings: [],
    prewarm: null,
    ...overrides,
  };
}
