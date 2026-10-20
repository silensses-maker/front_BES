import { environmentLabel } from "./environment";
import type { BenchResultDocument, PhaseResult, ScenarioResult } from "./result-schema";

/**
 * Flattened CSV of a result document (#126): one row per scenario × phase, plus one row per
 * scenario without phases (failed loads). Shared by the page export and the aggregation script,
 * so both CSVs have the same columns.
 */

const MB = 1024 * 1024;

export const CSV_COLUMNS = [
  "result_id",
  "kind",
  "schema_version",
  "started_at",
  "app_version",
  "git_commit",
  "git_dirty",
  "build_mode",
  "machine",
  "gpu_vendor",
  "gpu_renderer",
  "gpu_source",
  "canvas_renderer",
  "software_rendering",
  "cpu_threads",
  "device_memory_gb",
  "browser",
  "platform",
  "user_agent",
  "screen",
  "dpr",
  "viewport",
  "refresh_hz_est",
  "cross_origin_isolated",
  "seed",
  "scenario_id",
  "source",
  "agents",
  "density",
  "edges",
  "repetition",
  "status",
  "error",
  "stage",
  "phase",
  "variant",
  "canvas_variant",
  "links_in_data",
  "links_drawn",
  "rendered_entities",
  "window_comparable",
  "warmup_ms",
  "measure_ms",
  "actual_ms",
  "frames",
  "fps_median",
  "fps_p5",
  "fps_p1",
  "fps_mean",
  "frame_ms_mean",
  "frame_ms_p50",
  "frame_ms_p95",
  "frame_ms_p99",
  "frame_ms_max",
  "slow_frame_share_33ms",
  "frames_over_33ms",
  "frames_over_50ms",
  "dropped_frames_est",
  "long_tasks",
  "long_task_total_ms",
  "long_task_max_ms",
  "heap_min_mb",
  "heap_max_mb",
  "heap_end_mb",
  "ua_memory_status",
  "ua_memory_mb",
  "gpu_mem_estimate_mb",
  "repaint_speed",
  "repaint_rounds_rendered",
  "repaints_per_s",
  "rb_rounds",
  "rb_merge_ms_median",
  "rb_commit_ms_median",
  "rb_cosmograph_updates",
  "rb_cosmograph_update_ms_median",
  "rb_cosmograph_update_ms_p95",
  "rb_cosmograph_sync_ms_median",
  "rb_color_updates",
  "rb_long_task_ms_per_s",
  "lead_label",
  "lead_started_by",
  "lead_ms",
  "lead_frames",
  "lead_max_frame_ms",
  "lead_long_tasks",
  "lead_long_task_ms",
  "load_generate_ms",
  "load_fetch_ms",
  "load_network_ms",
  "load_parse_ms",
  "load_to_data_ms",
  "load_prepare_ms",
  "load_mount_ms",
  "load_layout_ms",
  "load_upload_ms",
  "load_upload_long_tasks",
  "load_upload_long_task_ms",
  "load_upload_max_frame_ms",
  "load_total_ms",
  "topology_fetches",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRow = Record<CsvColumn, string | number | boolean | null>;

const round = (v: number | null | undefined, digits = 2): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(digits));
const mb = (bytes: number | null | undefined) =>
  bytes === null || bytes === undefined ? null : round(bytes / MB, 1);

/**
 * Version 1 started the layout / cluster-layout windows at the canvas' layout commit, before the
 * data upload: those windows mix empty frames with the upload stall and are not comparable.
 */
export function isWindowComparable(schemaVersion: number, phase: string): boolean {
  return !(schemaVersion < 2 && (phase === "layout" || phase === "cluster-layout"));
}

export function browserLabel(doc: Pick<BenchResultDocument, "environment">): string {
  const ua = doc.environment.userAgentData;
  const brand = ua?.fullVersionList?.find((b) => !/not.?a.?brand|chromium/i.test(b));
  return brand ?? ua?.brands.find((b) => !/not.?a.?brand|chromium/i.test(b)) ?? ua?.brands[0] ?? "";
}

function scenarioColumns(doc: BenchResultDocument, s: ScenarioResult) {
  const env = doc.environment;
  return {
    result_id: doc.id,
    kind: doc.kind,
    schema_version: doc.schemaVersion,
    started_at: doc.startedAt,
    app_version: doc.build.appVersion,
    git_commit: doc.build.gitCommit,
    git_dirty: doc.build.gitDirty,
    build_mode: doc.build.mode,
    machine: environmentLabel(env),
    gpu_vendor: env.gpu.vendor,
    gpu_renderer: env.gpu.renderer,
    gpu_source: env.gpu.source,
    canvas_renderer: s.canvasRenderer ?? null,
    software_rendering: env.gpu.softwareRendering,
    cpu_threads: env.hardwareConcurrency,
    device_memory_gb: env.deviceMemoryGb,
    browser: browserLabel(doc),
    platform: env.userAgentData?.platform ?? null,
    user_agent: env.userAgent,
    screen: `${env.screen.width}x${env.screen.height}`,
    dpr: env.devicePixelRatio,
    viewport: `${env.viewport.width}x${env.viewport.height}`,
    refresh_hz_est: round(env.refreshRateHzEst, 1),
    cross_origin_isolated: env.crossOriginIsolated,
    seed: s.seed,
    scenario_id: s.id,
    source: s.source,
    agents: s.agents,
    density: s.density,
    edges: s.edges,
    repetition: s.repetition,
    status: s.status,
    error: s.error,
    stage: `${s.stage.width}x${s.stage.height}@${s.stage.devicePixelRatio}`,
    gpu_mem_estimate_mb: mb(s.gpuMemoryEstimate?.totalBytes),
    load_generate_ms: round(s.load.generateMs, 1),
    load_fetch_ms: round(s.load.fetchMs, 1),
    load_network_ms: round(s.load.networkMs, 1),
    load_parse_ms: round(s.load.parseMs, 1),
    load_to_data_ms: round(s.load.toDataMs, 1),
    load_prepare_ms: round(s.load.prepareMs, 1),
    load_mount_ms: round(s.load.mountMs, 1),
    load_layout_ms: round(s.load.layoutMs, 1),
    load_upload_ms: round(s.load.uploadMs ?? null, 1),
    load_upload_long_tasks: s.load.uploadLongTasks ?? null,
    load_upload_long_task_ms: round(s.load.uploadLongTaskMs ?? null, 1),
    load_upload_max_frame_ms: round(s.load.uploadMaxFrameMs ?? null, 1),
    load_total_ms: round(s.load.totalMs, 1),
    topology_fetches: s.load.topologyFetches,
  };
}

const EMPTY_PHASE = {
  phase: null,
  variant: null,
  canvas_variant: null,
  links_in_data: null,
  links_drawn: null,
  rendered_entities: null,
  window_comparable: null,
  warmup_ms: null,
  measure_ms: null,
  actual_ms: null,
  frames: null,
  fps_median: null,
  fps_p5: null,
  fps_p1: null,
  fps_mean: null,
  frame_ms_mean: null,
  frame_ms_p50: null,
  frame_ms_p95: null,
  frame_ms_p99: null,
  frame_ms_max: null,
  slow_frame_share_33ms: null,
  frames_over_33ms: null,
  frames_over_50ms: null,
  dropped_frames_est: null,
  long_tasks: null,
  long_task_total_ms: null,
  long_task_max_ms: null,
  heap_min_mb: null,
  heap_max_mb: null,
  heap_end_mb: null,
  ua_memory_status: null,
  ua_memory_mb: null,
  repaint_speed: null,
  repaint_rounds_rendered: null,
  repaints_per_s: null,
  rb_rounds: null,
  rb_merge_ms_median: null,
  rb_commit_ms_median: null,
  rb_cosmograph_updates: null,
  rb_cosmograph_update_ms_median: null,
  rb_cosmograph_update_ms_p95: null,
  rb_cosmograph_sync_ms_median: null,
  rb_color_updates: null,
  rb_long_task_ms_per_s: null,
  lead_label: null,
  lead_started_by: null,
  lead_ms: null,
  lead_frames: null,
  lead_max_frame_ms: null,
  lead_long_tasks: null,
  lead_long_task_ms: null,
};

function phaseColumns(doc: BenchResultDocument, s: ScenarioResult, p: PhaseResult) {
  const f = p.frames;
  const links = p.links ?? { inData: s.edges, drawn: s.edges };
  const rb = p.repaint?.breakdown ?? null;
  const lead = p.lead ?? null;
  return {
    phase: p.phase,
    variant: p.variant,
    canvas_variant: p.canvasVariant ?? "baseline",
    links_in_data: links.inData,
    links_drawn: links.drawn,
    rendered_entities: s.agents + links.drawn,
    window_comparable: isWindowComparable(doc.schemaVersion, p.phase),
    warmup_ms: p.warmupMs,
    measure_ms: p.measureMs,
    actual_ms: round(p.actualMs, 0),
    frames: f.frames,
    fps_median: round(f.fps.median),
    fps_p5: round(f.fps.p5),
    fps_p1: round(f.fps.p1),
    fps_mean: round(f.fps.mean),
    frame_ms_mean: round(f.frameTimeMs.mean),
    frame_ms_p50: round(f.frameTimeMs.p50),
    frame_ms_p95: round(f.frameTimeMs.p95),
    frame_ms_p99: round(f.frameTimeMs.p99),
    frame_ms_max: round(f.frameTimeMs.max),
    slow_frame_share_33ms: round(f.slowFrameShare, 4),
    frames_over_33ms: f.framesOver33ms,
    frames_over_50ms: f.framesOver50ms,
    dropped_frames_est: f.droppedFramesEst,
    long_tasks: p.longTasks.supported ? p.longTasks.count : null,
    long_task_total_ms: p.longTasks.supported ? round(p.longTasks.totalMs, 1) : null,
    long_task_max_ms: p.longTasks.supported ? round(p.longTasks.maxMs, 1) : null,
    heap_min_mb: mb(p.heap.minBytes),
    heap_max_mb: mb(p.heap.maxBytes),
    heap_end_mb: mb(p.heap.endBytes),
    ua_memory_status: p.uaMemory?.status ?? null,
    ua_memory_mb: mb(p.uaMemory?.bytes ?? null),
    repaint_speed: p.repaint?.speed ?? null,
    repaint_rounds_rendered: p.repaint?.roundsRendered ?? null,
    repaints_per_s: round(p.repaint?.repaintsPerSecond ?? null),
    rb_rounds: rb?.rounds ?? null,
    rb_merge_ms_median: round(rb?.mergeMs.median ?? null),
    rb_commit_ms_median: round(rb?.commitMs.median ?? null),
    rb_cosmograph_updates: rb?.cosmographUpdates ?? null,
    rb_cosmograph_update_ms_median: round(rb?.cosmographUpdateMs.median ?? null),
    rb_cosmograph_update_ms_p95: round(rb?.cosmographUpdateMs.p95 ?? null),
    rb_cosmograph_sync_ms_median: round(rb?.cosmographSyncMs.median ?? null),
    rb_color_updates: rb?.colorUpdates ?? null,
    rb_long_task_ms_per_s: round(rb?.longTaskMsPerSecond ?? null, 1),
    lead_label: lead?.label ?? null,
    lead_started_by: lead?.startedBy ?? null,
    lead_ms: round(lead?.durationMs ?? null, 1),
    lead_frames: lead?.frames ?? null,
    lead_max_frame_ms: round(lead?.maxFrameMs ?? null, 1),
    lead_long_tasks: lead?.longTasks.supported ? lead.longTasks.count : null,
    lead_long_task_ms: lead?.longTasks.supported ? round(lead.longTasks.totalMs, 1) : null,
  };
}

export function flattenResult(doc: BenchResultDocument): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const scenario of doc.scenarios) {
    const base = scenarioColumns(doc, scenario);
    if (scenario.phases.length === 0) rows.push({ ...base, ...EMPTY_PHASE });
    for (const phase of scenario.phases) {
      rows.push({ ...base, ...phaseColumns(doc, scenario, phase) });
    }
  }
  return rows;
}

/** RFC 4180 field: quoted when it contains a comma, quote, CR or LF. */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<C extends string>(
  columns: readonly C[],
  rows: ReadonlyArray<Record<C, string | number | boolean | null>>,
): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function resultToCsv(doc: BenchResultDocument): string {
  return toCsv(CSV_COLUMNS, flattenResult(doc));
}
