import { median } from "./frame-stats";
import { type CsvRow, flattenResult, toCsv } from "./result-csv";
import type { BenchResultDocument } from "./result-schema";

/**
 * Aggregation of exported results into report tables (#126), used by
 * `benchmarks/scripts/aggregate.ts`. Results are grouped per machine (GPU · CPU threads ·
 * platform · browser) — numbers from different machines are never mixed — then per
 * source × size × density × phase × variant × canvas variant, taking the MEDIAN over repetitions.
 *
 * Headline metric: MEAN FPS (frames delivered / measured seconds). On a vsync-locked display
 * frame times are quantized to multiples of the refresh interval (165 Hz → 165, 82.5, 55, 41.25,
 * 33, 27.5 FPS…), so the median jumps between those levels while the mean moves smoothly with
 * the work. Pass/fail follows OE3 literally on it: PASS when mean FPS is strictly greater than the
 * threshold (30). The "1% low" is 1000 / p99 frame time.
 *
 * Version 1 files are read too; their layout / cluster-layout windows included the data upload
 * and are reported as not comparable (no pass/fail).
 */

export interface AggregateOptions {
  threshold: number;
  includeDev: boolean;
  includeSoftware: boolean;
}

export const DEFAULT_AGGREGATE_OPTIONS: AggregateOptions = {
  threshold: 30,
  includeDev: false,
  includeSoftware: false,
};

export interface LoadedResult {
  file: string;
  doc: BenchResultDocument;
}

export interface PhaseAggregate {
  machine: string;
  source: string;
  agents: number;
  density: number | null;
  /** Links in the data handed to the canvas (= edges, or pairs for one-link-per-pair). */
  links: number | null;
  /** Links actually drawn (0 for links-off). */
  linksDrawn: number | null;
  /** Agents + links drawn. */
  entities: number | null;
  phase: string;
  variant: string | null;
  canvasVariant: string;
  /** False for version-1 layout windows (they included the data upload). */
  comparable: boolean;
  reps: number;
  /** Headline: frames delivered / measured seconds (median over repetitions). */
  fpsMean: number | null;
  /** Mean frame time (ms) — 1000 / mean FPS. */
  frameMsMean: number | null;
  /** 1% low: 1000 / p99 frame time. */
  fpsLow1: number | null;
  fpsP5: number | null;
  fpsMedian: number | null;
  slowFrameShare: number | null;
  framesOver50: number | null;
  longTasks: number | null;
  longTaskMs: number | null;
  heapMaxMb: number | null;
  gpuEstimateMb: number | null;
  repaintsPerSecond: number | null;
  /** v2 repaint breakdown medians. */
  rbMergeMs: number | null;
  rbCommitMs: number | null;
  rbUpdateMs: number | null;
  rbUpdateP95Ms: number | null;
  rbSyncMs: number | null;
  rbLongTaskMsPerS: number | null;
  /** v2 layout lead (upload / cluster update) medians. */
  leadMs: number | null;
  leadLongTaskMs: number | null;
  pass: boolean | null;
}

export interface LoadAggregate {
  machine: string;
  source: string;
  agents: number;
  density: number | null;
  edges: number | null;
  scenarios: number;
  generateMs: number | null;
  fetchMs: number | null;
  networkMs: number | null;
  parseMs: number | null;
  toDataMs: number | null;
  prepareMs: number | null;
  mountMs: number | null;
  uploadMs: number | null;
  layoutMs: number | null;
  totalMs: number | null;
}

export interface MachineInfo {
  machine: string;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  /** v2: renderer strings of the contexts the canvas actually drew with. */
  canvasRenderers: string[];
  cpuThreads: number | null;
  deviceMemoryGb: number | null;
  browser: string;
  platform: string | null;
  screen: string;
  dpr: number | null;
  refreshHz: number | null;
  builds: string[];
  files: string[];
  schemaVersions: number[];
}

/** Least-squares line of mean frame time against links drawn. */
export interface LinkFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
}

/** Least-squares plane: frame time ≈ intercept + perAgent·agents + perLink·links. */
export interface TwoFactorFit {
  intercept: number;
  perAgent: number;
  perLink: number;
  r2: number;
  n: number;
}

export interface LinkAnalysis {
  machine: string;
  phase: string;
  variant: string | null;
  points: PhaseAggregate[];
  /** Points used by the fit (display-capped points excluded). */
  fitted: number;
  fit: LinkFit | null;
  /** Both factors at once: separates the per-link (drawing) from the per-agent cost. */
  fit2: TwoFactorFit | null;
  /** Links at which the fitted frame time reaches 1000 / threshold ms. */
  crossingLinks: number | null;
  highestPassingLinks: number | null;
  lowestFailingLinks: number | null;
}

export interface AggregateReport {
  options: AggregateOptions;
  files: number;
  excluded: Array<{ file: string; reason: string }>;
  machines: MachineInfo[];
  phases: PhaseAggregate[];
  loads: LoadAggregate[];
  links: LinkAnalysis[];
  failures: Array<{
    machine: string;
    file: string;
    scenario: string;
    status: string;
    error: string;
  }>;
  warnings: Array<{ file: string; warning: string }>;
  rows: CsvRow[];
}

const PHASE_ORDER = [
  "layout",
  "idle",
  "interaction",
  "repaint",
  "cluster-layout",
  "cluster-idle",
  "cluster-interaction",
  "hud-record",
];

export const CANVAS_VARIANT_ORDER = [
  "baseline",
  "links-transparent",
  "links-off",
  "straight-links",
  "one-link-per-pair",
];

/** Phases analysed against the link count (baseline canvas). */
const LINK_PHASES: ReadonlyArray<{ phase: string; variant: string | null }> = [
  { phase: "idle", variant: null },
  { phase: "interaction", variant: null },
  { phase: "repaint", variant: "x1" },
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function medianOf(values: Array<unknown>): number | null {
  const nums = values.map(num).filter((v): v is number => v !== null);
  return nums.length > 0 ? median(nums) : null;
}

function maxOf(values: Array<unknown>): number | null {
  const nums = values.map(num).filter((v): v is number => v !== null);
  return nums.length > 0 ? Math.max(...nums) : null;
}

/** Why a document is left out of the report, or null to keep it. */
export function exclusionReason(
  doc: BenchResultDocument,
  options: AggregateOptions,
): string | null {
  if (doc.build.mode !== "production" && !options.includeDev) {
    return `${doc.build.mode} build (use the optimized \`bun run bench\` build, or --include-dev)`;
  }
  if (doc.environment.gpu.softwareRendering && !options.includeSoftware) {
    return `software rendering (${doc.environment.gpu.renderer ?? "unknown"}) — not a real GPU`;
  }
  return null;
}

function speedOrder(variant: string | null): number {
  const m = variant !== null ? /^x(\d+)$/.exec(variant) : null;
  return m ? Number(m[1]) : 0;
}

export function comparePhases(
  a: Pick<PhaseAggregate, "agents" | "density" | "phase" | "variant" | "source"> & {
    canvasVariant?: string;
  },
  b: Pick<PhaseAggregate, "agents" | "density" | "phase" | "variant" | "source"> & {
    canvasVariant?: string;
  },
): number {
  return (
    a.source.localeCompare(b.source) ||
    a.agents - b.agents ||
    (a.density ?? 0) - (b.density ?? 0) ||
    CANVAS_VARIANT_ORDER.indexOf(a.canvasVariant ?? "baseline") -
      CANVAS_VARIANT_ORDER.indexOf(b.canvasVariant ?? "baseline") ||
    PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
    speedOrder(a.variant) - speedOrder(b.variant) ||
    (a.variant ?? "").localeCompare(b.variant ?? "")
  );
}

/** Ordinary least squares of y on x; null with fewer than 2 distinct x. */
export function linearFit(points: ReadonlyArray<{ x: number; y: number }>): LinkFit | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { intercept, slope, r2, n };
}

/** Ordinary least squares of y on (a, b); null when the system is singular or too small. */
export function twoFactorFit(
  points: ReadonlyArray<{ a: number; b: number; y: number }>,
): TwoFactorFit | null {
  const n = points.length;
  if (n < 4) return null;
  // Normal equations for [1, a, b]
  let s1 = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sab = 0;
  let sbb = 0;
  let sy = 0;
  let say = 0;
  let sby = 0;
  for (const p of points) {
    s1 += 1;
    sa += p.a;
    sb += p.b;
    saa += p.a * p.a;
    sab += p.a * p.b;
    sbb += p.b * p.b;
    sy += p.y;
    say += p.a * p.y;
    sby += p.b * p.y;
  }
  const m = [
    [s1, sa, sb, sy],
    [sa, saa, sab, say],
    [sb, sab, sbb, sby],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0)) pivot = r;
    }
    const rowP = m[pivot] as number[];
    if (Math.abs(rowP[col] ?? 0) < 1e-12) return null;
    m[pivot] = m[col] as number[];
    m[col] = rowP;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const row = m[r] as number[];
      const f = (row[col] ?? 0) / (rowP[col] ?? 1);
      for (let c = col; c < 4; c++) row[c] = (row[c] ?? 0) - f * (rowP[c] ?? 0);
    }
  }
  const coef = m.map((row, i) => (row[3] ?? 0) / (row[i] ?? 1));
  const [intercept, perAgent, perLink] = coef as [number, number, number];
  const mean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const fitted = intercept + perAgent * p.a + perLink * p.b;
    ssTot += (p.y - mean) ** 2;
    ssRes += (p.y - fitted) ** 2;
  }
  return { intercept, perAgent, perLink, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n };
}

/**
 * Frame rate against the links drawn, per machine and phase (baseline canvas, comparable
 * windows): a least-squares line of mean frame time on links over the points that are not capped
 * by the display refresh (mean FPS ≥ 90 % of the refresh rate measures the display, not the
 * rendering), and the link count where it reaches 1000 / threshold ms.
 */
export function analyseLinks(
  phases: readonly PhaseAggregate[],
  machine: MachineInfo,
  threshold: number,
): LinkAnalysis[] {
  const out: LinkAnalysis[] = [];
  for (const target of LINK_PHASES) {
    const points = phases
      .filter(
        (p) =>
          p.machine === machine.machine &&
          p.canvasVariant === "baseline" &&
          p.comparable &&
          p.phase === target.phase &&
          p.variant === target.variant &&
          p.linksDrawn !== null &&
          p.frameMsMean !== null,
      )
      .sort((a, b) => (a.linksDrawn ?? 0) - (b.linksDrawn ?? 0) || a.agents - b.agents);
    if (points.length === 0) continue;
    const capFps = machine.refreshHz !== null ? 0.9 * machine.refreshHz : Number.POSITIVE_INFINITY;
    const usable = points.filter((p) => (p.fpsMean ?? 0) < capFps);
    const fit = linearFit(usable.map((p) => ({ x: p.linksDrawn ?? 0, y: p.frameMsMean ?? 0 })));
    const fit2 = twoFactorFit(
      usable.map((p) => ({ a: p.agents, b: p.linksDrawn ?? 0, y: p.frameMsMean ?? 0 })),
    );
    const targetMs = 1000 / threshold;
    const crossing =
      fit !== null && fit.slope > 0 && fit.intercept < targetMs
        ? (targetMs - fit.intercept) / fit.slope
        : null;
    const passing = points.filter((p) => p.pass === true).map((p) => p.linksDrawn ?? 0);
    const failing = points.filter((p) => p.pass === false).map((p) => p.linksDrawn ?? 0);
    out.push({
      machine: machine.machine,
      phase: target.phase,
      variant: target.variant,
      points,
      fitted: usable.length,
      fit,
      fit2,
      crossingLinks: crossing,
      highestPassingLinks: passing.length > 0 ? Math.max(...passing) : null,
      lowestFailingLinks: failing.length > 0 ? Math.min(...failing) : null,
    });
  }
  return out;
}

export function aggregateResults(
  results: readonly LoadedResult[],
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS,
): AggregateReport {
  const excluded: AggregateReport["excluded"] = [];
  const rows: CsvRow[] = [];
  const machines = new Map<string, MachineInfo>();
  const failures: AggregateReport["failures"] = [];
  const warnings: AggregateReport["warnings"] = [];

  for (const { file, doc } of results) {
    const reason = exclusionReason(doc, options);
    if (reason !== null) {
      excluded.push({ file, reason });
      continue;
    }
    const docRows = flattenResult(doc);
    rows.push(...docRows);
    const machine = String(docRows[0]?.machine ?? "unknown machine");
    const info = machines.get(machine) ?? {
      machine,
      gpuRenderer: doc.environment.gpu.renderer,
      gpuVendor: doc.environment.gpu.vendor,
      canvasRenderers: [],
      cpuThreads: doc.environment.hardwareConcurrency,
      deviceMemoryGb: doc.environment.deviceMemoryGb,
      browser: String(docRows[0]?.browser ?? ""),
      platform: doc.environment.userAgentData?.platform ?? null,
      screen: `${doc.environment.screen.width}x${doc.environment.screen.height}`,
      dpr: doc.environment.devicePixelRatio,
      refreshHz: doc.environment.refreshRateHzEst,
      builds: [],
      files: [],
      schemaVersions: [],
    };
    const build = `${doc.build.appVersion} (${doc.build.gitCommit}${doc.build.gitDirty ? ", dirty" : ""})`;
    if (!info.builds.includes(build)) info.builds.push(build);
    if (!info.schemaVersions.includes(doc.schemaVersion))
      info.schemaVersions.push(doc.schemaVersion);
    info.files.push(file);
    for (const s of doc.scenarios) {
      if (s.canvasRenderer && !info.canvasRenderers.includes(s.canvasRenderer)) {
        info.canvasRenderers.push(s.canvasRenderer);
      }
      if (s.status !== "ok") {
        failures.push({ machine, file, scenario: s.id, status: s.status, error: s.error ?? "" });
      }
    }
    for (const warning of doc.warnings ?? []) warnings.push({ file, warning });
    machines.set(machine, info);
  }

  const okRows = rows.filter((r) => r.status === "ok" && r.phase !== null);
  const phaseGroups = new Map<string, CsvRow[]>();
  for (const r of okRows) {
    const key = [
      r.machine,
      r.source,
      r.agents,
      r.density,
      r.phase,
      r.variant,
      r.canvas_variant,
      r.window_comparable,
    ].join("|");
    const group = phaseGroups.get(key) ?? [];
    group.push(r);
    phaseGroups.set(key, group);
  }
  const phases: PhaseAggregate[] = [];
  for (const group of phaseGroups.values()) {
    const first = group[0] as CsvRow;
    const m = (col: keyof CsvRow) => medianOf(group.map((r) => r[col]));
    const fpsMean = m("fps_mean");
    const comparable = first.window_comparable !== false;
    phases.push({
      machine: String(first.machine),
      source: String(first.source),
      agents: Number(first.agents),
      density: num(first.density),
      links: m("links_in_data"),
      linksDrawn: m("links_drawn"),
      entities: m("rendered_entities"),
      phase: String(first.phase),
      variant: first.variant === null ? null : String(first.variant),
      canvasVariant: String(first.canvas_variant ?? "baseline"),
      comparable,
      reps: group.length,
      fpsMean,
      frameMsMean: fpsMean !== null && fpsMean > 0 ? 1000 / fpsMean : null,
      fpsLow1: m("fps_p1"),
      fpsP5: m("fps_p5"),
      fpsMedian: m("fps_median"),
      slowFrameShare: m("slow_frame_share_33ms"),
      framesOver50: m("frames_over_50ms"),
      longTasks: m("long_tasks"),
      longTaskMs: m("long_task_total_ms"),
      heapMaxMb: maxOf(group.map((r) => r.heap_max_mb)),
      gpuEstimateMb: m("gpu_mem_estimate_mb"),
      repaintsPerSecond: m("repaints_per_s"),
      rbMergeMs: m("rb_merge_ms_median"),
      rbCommitMs: m("rb_commit_ms_median"),
      rbUpdateMs: m("rb_cosmograph_update_ms_median"),
      rbUpdateP95Ms: m("rb_cosmograph_update_ms_p95"),
      rbSyncMs: m("rb_cosmograph_sync_ms_median"),
      rbLongTaskMsPerS: m("rb_long_task_ms_per_s"),
      leadMs: m("lead_ms"),
      leadLongTaskMs: m("lead_long_task_ms"),
      pass: !comparable || fpsMean === null ? null : fpsMean > options.threshold,
    });
  }
  phases.sort((a, b) => a.machine.localeCompare(b.machine) || comparePhases(a, b));

  // Load timings: one value per scenario (the CSV repeats them on every phase row).
  const perScenario = new Map<string, CsvRow>();
  for (const r of rows) {
    if (r.status !== "ok") continue;
    perScenario.set(`${r.result_id}|${r.scenario_id}`, r);
  }
  const loadGroups = new Map<string, CsvRow[]>();
  for (const r of perScenario.values()) {
    const key = [r.machine, r.source, r.agents, r.density].join("|");
    const group = loadGroups.get(key) ?? [];
    group.push(r);
    loadGroups.set(key, group);
  }
  const loads: LoadAggregate[] = [];
  for (const group of loadGroups.values()) {
    const first = group[0] as CsvRow;
    const m = (col: keyof CsvRow) => medianOf(group.map((r) => r[col]));
    loads.push({
      machine: String(first.machine),
      source: String(first.source),
      agents: Number(first.agents),
      density: num(first.density),
      edges: m("edges"),
      scenarios: group.length,
      generateMs: m("load_generate_ms"),
      fetchMs: m("load_fetch_ms"),
      networkMs: m("load_network_ms"),
      parseMs: m("load_parse_ms"),
      toDataMs: m("load_to_data_ms"),
      prepareMs: m("load_prepare_ms"),
      mountMs: m("load_mount_ms"),
      uploadMs: m("load_upload_ms"),
      layoutMs: m("load_layout_ms"),
      totalMs: m("load_total_ms"),
    });
  }
  loads.sort(
    (a, b) =>
      a.machine.localeCompare(b.machine) ||
      a.source.localeCompare(b.source) ||
      a.agents - b.agents ||
      (a.density ?? 0) - (b.density ?? 0),
  );

  const machineList = [...machines.values()].sort((a, b) => a.machine.localeCompare(b.machine));
  return {
    options,
    files: results.length,
    excluded,
    machines: machineList,
    phases,
    loads,
    links: machineList.flatMap((machine) => analyseLinks(phases, machine, options.threshold)),
    failures,
    warnings,
    rows,
  };
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

const fmt = (v: number | null, digits = 1) => (v === null ? "–" : v.toFixed(digits));
const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)} %`);
const int = (v: number | null) => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));

function phaseLabel(p: Pick<PhaseAggregate, "phase" | "variant">): string {
  return p.variant !== null ? `${p.phase} (${p.variant})` : p.phase;
}

function passLabel(p: Pick<PhaseAggregate, "pass" | "comparable">): string {
  if (!p.comparable) return "n/c¹";
  return p.pass === null ? "n/a" : p.pass ? "PASS" : "FAIL";
}

function mdTable(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(header), `|${header.map(() => " --- ").join("|")}|`, ...rows.map(line)].join("\n");
}

function renderVariants(out: string[], phases: readonly PhaseAggregate[], t: number): void {
  const variantRows = phases.filter((p) => p.canvasVariant !== "baseline");
  if (variantRows.length === 0) return;
  const keys = new Map<string, PhaseAggregate>();
  for (const p of variantRows) {
    keys.set([p.source, p.agents, p.density, p.phase, p.variant].join("|"), p);
  }
  const find = (ref: PhaseAggregate, variant: string) =>
    phases.find(
      (p) =>
        p.canvasVariant === variant &&
        p.source === ref.source &&
        p.agents === ref.agents &&
        p.density === ref.density &&
        p.phase === ref.phase &&
        p.variant === ref.variant &&
        p.comparable,
    );
  const cell = (base: PhaseAggregate | undefined, v: PhaseAggregate | undefined) => {
    if (v === undefined || v.fpsMean === null) return "–";
    if (base === undefined || base.fpsMean === null || base.fpsMean === 0) return fmt(v.fpsMean);
    const change = ((v.fpsMean - base.fpsMean) / base.fpsMean) * 100;
    return `${fmt(v.fpsMean)} (${change >= 0 ? "+" : ""}${change.toFixed(0)} %)`;
  };
  const refs = [...keys.values()].sort(comparePhases);
  out.push("### Canvas variants (LOD study, #50) — mean FPS, change vs baseline", "");
  out.push(
    '`links-transparent` is the product\'s "hide links" toggle (links still drawn); `links-off` is ' +
      "`renderLinks: false`; `straight-links` is `curvedLinks: false`; `one-link-per-pair` keeps one of the " +
      "two reciprocal edges of every pair (half the links).",
    "",
  );
  out.push(
    mdTable(
      [
        "Agents",
        "Density",
        "Links",
        "Phase",
        "baseline",
        "links-transparent",
        "links-off",
        "straight-links",
        "one-link-per-pair",
        `baseline > ${t}`,
      ],
      refs.map((ref) => {
        const base = find(ref, "baseline");
        return [
          int(ref.agents),
          ref.density === null ? "–" : String(ref.density),
          int(base?.links ?? null),
          phaseLabel(ref),
          base === undefined ? "–" : fmt(base.fpsMean),
          cell(base, find(ref, "links-transparent")),
          cell(base, find(ref, "links-off")),
          cell(base, find(ref, "straight-links")),
          cell(base, find(ref, "one-link-per-pair")),
          base === undefined ? "–" : passLabel(base),
        ];
      }),
    ),
    "",
  );
}

function renderRepaintBreakdown(out: string[], phases: readonly PhaseAggregate[]): void {
  const repaint = phases.filter(
    (p) => p.phase === "repaint" && p.canvasVariant === "baseline" && p.rbUpdateMs !== null,
  );
  if (repaint.length === 0) return;
  const idleOf = (p: PhaseAggregate) =>
    phases.find(
      (q) =>
        q.phase === "idle" &&
        q.canvasVariant === "baseline" &&
        q.source === p.source &&
        q.agents === p.agents &&
        q.density === p.density,
    );
  out.push("### Repaint breakdown (per round, medians)", "");
  out.push(
    "Per round the playback pushes one frame to the store; the canvas re-renders and hands Cosmograph " +
      "new colour/size functions; Cosmograph's `setConfig` re-queries the point table from DuckDB-WASM, " +
      "recomputes every colour and size in JS and uploads them. *Idle frame* is the same network with " +
      "nothing changing (the drawing cost); the difference to the repaint frame is what the per-round " +
      "update adds.",
    "",
  );
  out.push(
    mdTable(
      [
        "Agents",
        "Density",
        "Links",
        "Speed",
        "Rounds/s",
        "Repaint frame (ms)",
        "Idle frame (ms)",
        "Merge (ms)",
        "Store → commit (ms)",
        "Cosmograph update (ms)",
        "update p95",
        "sync part (ms)",
        "Long tasks (ms/s)",
      ],
      repaint.map((p) => [
        int(p.agents),
        p.density === null ? "–" : String(p.density),
        int(p.links),
        p.variant ?? "–",
        fmt(p.repaintsPerSecond),
        fmt(p.frameMsMean),
        fmt(idleOf(p)?.frameMsMean ?? null),
        fmt(p.rbMergeMs, 2),
        fmt(p.rbCommitMs),
        fmt(p.rbUpdateMs),
        fmt(p.rbUpdateP95Ms),
        fmt(p.rbSyncMs),
        fmt(p.rbLongTaskMsPerS, 0),
      ]),
    ),
    "",
  );
}

function renderLinks(out: string[], analyses: readonly LinkAnalysis[], t: number): void {
  if (analyses.length === 0) return;
  out.push("### Frame rate vs rendered links (baseline canvas)", "");
  out.push(
    "Rendering cost follows the links drawn more than the agents. Rows are ordered by links. The " +
      "line is a least-squares fit of mean frame time on links over the points not capped by the " +
      "display refresh; it estimates where mean FPS crosses " +
      `${t} (${(1000 / t).toFixed(1)} ms per frame).`,
    "",
  );
  for (const a of analyses) {
    out.push(`#### ${phaseLabel(a)}`, "");
    out.push(
      mdTable(
        [
          "Links",
          "Agents",
          "Density",
          "Entities",
          "Mean FPS",
          "Mean frame (ms)",
          "1% low",
          `> ${t}`,
        ],
        a.points.map((p) => [
          int(p.linksDrawn),
          int(p.agents),
          p.density === null ? "–" : String(p.density),
          int(p.entities),
          fmt(p.fpsMean),
          fmt(p.frameMsMean),
          fmt(p.fpsLow1),
          passLabel(p),
        ]),
      ),
      "",
    );
    if (a.fit !== null) {
      out.push(
        `Fit over ${a.fitted} point(s): frame ≈ ${a.fit.intercept.toFixed(2)} ms + ${(a.fit.slope * 1e5).toFixed(2)} ms per 100k links (R² = ${a.fit.r2.toFixed(3)}); ` +
          (a.crossingLinks !== null
            ? `crosses ${t} FPS at ≈ ${int(a.crossingLinks)} links.`
            : `no crossing (the fitted frame time does not rise through ${(1000 / t).toFixed(1)} ms).`),
      );
    } else {
      out.push("Not enough uncapped points for a fit.");
    }
    if (a.fit2 !== null) {
      out.push(
        `Two-factor fit: frame ≈ ${a.fit2.intercept.toFixed(2)} ms + ${(a.fit2.perAgent * 1e5).toFixed(2)} ms per 100k agents + ${(a.fit2.perLink * 1e5).toFixed(2)} ms per 100k links (R² = ${a.fit2.r2.toFixed(3)}).`,
      );
    }
    out.push(
      `Highest link count that passes: ${int(a.highestPassingLinks)}; lowest that fails: ${int(a.lowestFailingLinks)}.`,
      "",
    );
  }
}

export function renderMarkdown(report: AggregateReport, generatedAt: string): string {
  const out: string[] = [];
  const t = report.options.threshold;
  out.push("# SiLEnSeSS rendering benchmark report", "");
  out.push(
    `Generated ${generatedAt} from ${report.files} result file(s) by \`benchmarks/scripts/aggregate.ts\`.`,
    `Values are medians over repetitions. **Headline: mean FPS** (frames delivered / measured seconds); ` +
      `**Pass** = mean FPS strictly greater than ${t} (OE3). The median is quantized by vsync ` +
      `(refresh / n) and is kept as a secondary column; *1% low* = 1000 / p99 frame time. ` +
      `GPU memory is an **estimate** from buffer sizes, not a measurement.`,
    "",
  );
  if (report.excluded.length > 0) {
    out.push("Excluded files:", "");
    for (const e of report.excluded) out.push(`- \`${e.file}\`: ${e.reason}`);
    out.push("");
  }
  if (report.machines.length === 0) {
    out.push("_No results to report._", "");
    return out.join("\n");
  }

  for (const machine of report.machines) {
    out.push(`## ${machine.machine}`, "");
    out.push(
      `- GPU: ${machine.gpuRenderer ?? "unknown"} (${machine.gpuVendor ?? "unknown vendor"})`,
      `- GPU used by the canvas: ${machine.canvasRenderers.length > 0 ? machine.canvasRenderers.join("; ") : "not recorded (schema v1)"}`,
      `- CPU threads: ${machine.cpuThreads ?? "unknown"} · device memory: ${machine.deviceMemoryGb !== null ? `${machine.deviceMemoryGb} GB (browser-capped)` : "unknown"}`,
      `- Browser: ${machine.browser || "unknown"} · platform: ${machine.platform ?? "unknown"}`,
      `- Screen: ${machine.screen} @ DPR ${machine.dpr ?? "?"} · refresh ≈ ${fmt(machine.refreshHz, 0)} Hz`,
      `- Builds: ${machine.builds.join(", ")} · schema version(s): ${machine.schemaVersions.join(", ")}`,
      `- Files: ${machine.files.map((f) => `\`${f}\``).join(", ")}`,
      "",
    );
    const warnings = report.warnings.filter((w) => machine.files.includes(w.file));
    if (warnings.length > 0) {
      out.push("Warnings recorded during the run:", "");
      for (const w of warnings) out.push(`- \`${w.file}\`: ${w.warning}`);
      out.push("");
    }

    const phases = report.phases.filter((p) => p.machine === machine.machine);
    const baseline = phases.filter((p) => p.canvasVariant === "baseline");
    out.push("### Frame rate by size × density × phase (baseline canvas)", "");
    out.push(
      mdTable(
        [
          "Source",
          "Agents",
          "Density",
          "Links",
          "Entities",
          "Phase",
          "Reps",
          "**Mean FPS**",
          "1% low",
          "p5 FPS",
          "Median FPS",
          "Frames > 33.3 ms",
          "Heap max (MB)",
          "GPU est. (MB)",
          `Mean > ${t}`,
        ],
        baseline.map((p) => [
          p.source,
          int(p.agents),
          p.density === null ? "–" : String(p.density),
          int(p.links),
          int(p.entities),
          phaseLabel(p),
          String(p.reps),
          fmt(p.fpsMean),
          fmt(p.fpsLow1),
          fmt(p.fpsP5),
          fmt(p.fpsMedian),
          pct(p.slowFrameShare),
          fmt(p.heapMaxMb, 0),
          fmt(p.gpuEstimateMb, 0),
          passLabel(p),
        ]),
      ),
      "",
    );
    if (baseline.some((p) => !p.comparable)) {
      out.push(
        "¹ Schema v1: the `layout` / `cluster-layout` window started at the canvas' layout commit, " +
          "before Cosmograph had uploaded the data, so it mixes fast empty frames with the upload " +
          "stall. Not comparable and not judged; schema v2 starts these windows at the first frame " +
          "drawn with the data and reports the upload separately.",
        "",
      );
    }

    renderLinks(
      out,
      report.links.filter((a) => a.machine === machine.machine),
      t,
    );
    renderVariants(out, phases, t);
    renderRepaintBreakdown(out, phases);

    const loads = report.loads.filter((l) => l.machine === machine.machine);
    out.push("### Load timings (median ms)", "");
    out.push(
      mdTable(
        [
          "Source",
          "Agents",
          "Density",
          "Scenarios",
          "Generate",
          "Fetch",
          "Network",
          "Parse",
          "topologyToData",
          "prepareCosmographData",
          "Mount",
          "Upload (first frame)²",
          "Layout until freeze",
          "Total",
        ],
        loads.map((l) => [
          l.source,
          int(l.agents),
          l.density === null ? "–" : String(l.density),
          String(l.scenarios),
          int(l.generateMs),
          int(l.fetchMs),
          int(l.networkMs),
          int(l.parseMs),
          int(l.toDataMs),
          int(l.prepareMs),
          int(l.mountMs),
          int(l.uploadMs),
          int(l.layoutMs),
          int(l.totalMs),
        ]),
      ),
      "",
      "² Layout commit → first frame Cosmograph draws with the data (schema v2; part of *Layout until freeze*).",
      "",
    );

    const failures = report.failures.filter((f) => f.machine === machine.machine);
    if (failures.length > 0) {
      out.push("### Failed scenarios", "");
      for (const f of failures)
        out.push(`- \`${f.scenario}\` (${f.file}): ${f.status} — ${f.error}`);
      out.push("");
    }
  }
  return out.join("\n");
}

export const SUMMARY_COLUMNS = [
  "machine",
  "source",
  "agents",
  "density",
  "links",
  "links_drawn",
  "entities",
  "phase",
  "variant",
  "canvas_variant",
  "comparable",
  "reps",
  "fps_mean",
  "frame_ms_mean",
  "fps_1pct_low",
  "fps_p5",
  "fps_median",
  "slow_frame_share_33ms",
  "frames_over_50ms",
  "long_tasks",
  "long_task_ms",
  "heap_max_mb",
  "gpu_mem_estimate_mb",
  "repaints_per_s",
  "rb_merge_ms",
  "rb_commit_ms",
  "rb_cosmograph_update_ms",
  "rb_cosmograph_update_p95_ms",
  "rb_cosmograph_sync_ms",
  "rb_long_task_ms_per_s",
  "lead_ms",
  "lead_long_task_ms",
  "pass",
] as const;

export const LOAD_COLUMNS = [
  "machine",
  "source",
  "agents",
  "density",
  "edges",
  "scenarios",
  "generate_ms",
  "fetch_ms",
  "network_ms",
  "parse_ms",
  "to_data_ms",
  "prepare_ms",
  "mount_ms",
  "upload_ms",
  "layout_ms",
  "total_ms",
] as const;

/** For plotting frame rate against links (baseline and variants). */
export const LINKS_COLUMNS = [
  "machine",
  "phase",
  "variant",
  "canvas_variant",
  "links_drawn",
  "links_in_data",
  "agents",
  "density",
  "entities",
  "fps_mean",
  "frame_ms_mean",
  "fps_1pct_low",
  "comparable",
  "pass",
] as const;

const r2 = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));

export function summaryCsv(report: AggregateReport): string {
  return toCsv(
    SUMMARY_COLUMNS,
    report.phases.map((p) => ({
      machine: p.machine,
      source: p.source,
      agents: p.agents,
      density: p.density,
      links: p.links,
      links_drawn: p.linksDrawn,
      entities: p.entities,
      phase: p.phase,
      variant: p.variant,
      canvas_variant: p.canvasVariant,
      comparable: p.comparable,
      reps: p.reps,
      fps_mean: r2(p.fpsMean),
      frame_ms_mean: r2(p.frameMsMean),
      fps_1pct_low: r2(p.fpsLow1),
      fps_p5: r2(p.fpsP5),
      fps_median: r2(p.fpsMedian),
      slow_frame_share_33ms: p.slowFrameShare === null ? null : Number(p.slowFrameShare.toFixed(4)),
      frames_over_50ms: p.framesOver50,
      long_tasks: p.longTasks,
      long_task_ms: r2(p.longTaskMs),
      heap_max_mb: p.heapMaxMb,
      gpu_mem_estimate_mb: p.gpuEstimateMb,
      repaints_per_s: r2(p.repaintsPerSecond),
      rb_merge_ms: r2(p.rbMergeMs),
      rb_commit_ms: r2(p.rbCommitMs),
      rb_cosmograph_update_ms: r2(p.rbUpdateMs),
      rb_cosmograph_update_p95_ms: r2(p.rbUpdateP95Ms),
      rb_cosmograph_sync_ms: r2(p.rbSyncMs),
      rb_long_task_ms_per_s: r2(p.rbLongTaskMsPerS),
      lead_ms: r2(p.leadMs),
      lead_long_task_ms: r2(p.leadLongTaskMs),
      pass: p.pass,
    })),
  );
}

export function linksCsv(report: AggregateReport): string {
  return toCsv(
    LINKS_COLUMNS,
    report.phases
      .filter((p) => ["idle", "interaction", "repaint"].includes(p.phase))
      .slice()
      .sort(
        (a, b) =>
          a.machine.localeCompare(b.machine) ||
          a.phase.localeCompare(b.phase) ||
          (a.variant ?? "").localeCompare(b.variant ?? "") ||
          a.canvasVariant.localeCompare(b.canvasVariant) ||
          (a.linksDrawn ?? 0) - (b.linksDrawn ?? 0),
      )
      .map((p) => ({
        machine: p.machine,
        phase: p.phase,
        variant: p.variant,
        canvas_variant: p.canvasVariant,
        links_drawn: p.linksDrawn,
        links_in_data: p.links,
        agents: p.agents,
        density: p.density,
        entities: p.entities,
        fps_mean: r2(p.fpsMean),
        frame_ms_mean: r2(p.frameMsMean),
        fps_1pct_low: r2(p.fpsLow1),
        comparable: p.comparable,
        pass: p.pass,
      })),
  );
}

export function loadCsv(report: AggregateReport): string {
  return toCsv(
    LOAD_COLUMNS,
    report.loads.map((l) => ({
      machine: l.machine,
      source: l.source,
      agents: l.agents,
      density: l.density,
      edges: l.edges,
      scenarios: l.scenarios,
      generate_ms: r2(l.generateMs),
      fetch_ms: r2(l.fetchMs),
      network_ms: r2(l.networkMs),
      parse_ms: r2(l.parseMs),
      to_data_ms: r2(l.toDataMs),
      prepare_ms: r2(l.prepareMs),
      mount_ms: r2(l.mountMs),
      upload_ms: r2(l.uploadMs),
      layout_ms: r2(l.layoutMs),
      total_ms: r2(l.totalMs),
    })),
  );
}
