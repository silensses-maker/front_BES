import type { BenchEnvironment } from "./environment";
import type { HeapReading } from "./frame-recorder";
import type { RollingFrameWindow } from "./frame-stats";
import type { GpuMemoryEstimate } from "./gpu-estimate";
import {
  BENCH_HARNESS_MARKER,
  BENCH_SCHEMA_VERSION,
  type BenchBuildInfo,
  type BenchResultDocument,
  createResultDocument,
  type LoadTimings,
  type PhaseResult,
} from "./result-schema";

/** The network on screen in the run view, as the HUD sees it. */
export interface HudNetwork {
  runId: string;
  networkId: string;
  agents: number | null;
  edges: number | null;
  density: number | null;
}

/** "Copy metrics": a JSON snapshot of what the HUD shows, for the measurement log. */
export function buildHudSnapshot(input: {
  build: BenchBuildInfo;
  environment: BenchEnvironment | null;
  network: HudNetwork;
  live: ReturnType<RollingFrameWindow["snapshot"]> | null;
  heap: HeapReading | null;
  load: LoadTimings;
  gpuMemoryEstimate: GpuMemoryEstimate | null;
  capturedAt?: Date;
}) {
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    harness: BENCH_HARNESS_MARKER,
    kind: "hud-snapshot" as const,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    build: input.build,
    environment: input.environment,
    network: input.network,
    fps: input.live,
    heap: input.heap,
    load: input.load,
    gpuMemoryEstimate: input.gpuMemoryEstimate,
  };
}

/**
 * "Record 10 s": one phase measured on a real run, as a result document the aggregation script
 * reads like a suite run (source "real-run").
 */
export function buildHudRecordDocument(input: {
  build: BenchBuildInfo;
  environment: BenchEnvironment;
  network: HudNetwork;
  phase: PhaseResult;
  load: LoadTimings;
  gpuMemoryEstimate: GpuMemoryEstimate | null;
  stage: { width: number; height: number; devicePixelRatio: number };
  startedAt: Date;
  context: Record<string, unknown>;
}): BenchResultDocument {
  const doc = createResultDocument({
    kind: "hud-record",
    build: input.build,
    environment: input.environment,
    config: { recordMs: input.phase.measureMs, ...input.context },
    startedAt: input.startedAt,
  });
  doc.scenarios.push({
    id: `real-${input.network.networkId}`,
    source: "real-run",
    agents: input.network.agents ?? 0,
    edges: input.network.edges ?? 0,
    density: input.network.density,
    repetition: 1,
    seed: null,
    runId: input.network.runId,
    networkId: input.network.networkId,
    status: "ok",
    error: null,
    stage: input.stage,
    load: input.load,
    gpuMemoryEstimate: input.gpuMemoryEstimate,
    forcedGc: false,
    phases: [input.phase],
  });
  doc.finishedAt = new Date(input.startedAt.getTime() + input.phase.actualMs).toISOString();
  doc.complete = true;
  return doc;
}
