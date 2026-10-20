import { median } from "./frame-stats";
import { type CsvRow, flattenResult, toCsv } from "./result-csv";
import type { BenchResultDocument } from "./result-schema";

/**
 * Aggregation of exported results into report tables (#126), used by
 * `benchmarks/scripts/aggregate.ts`. Results are grouped per machine (GPU · CPU threads ·
 * platform · browser) — numbers from different machines are never mixed — then per
 * source × size × density × phase (× variant), taking the MEDIAN over repetitions.
 *
 * Pass/fail follows OE3 literally: the phase passes when its median FPS is strictly greater
 * than the threshold (30 by default).
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
  edges: number | null;
  phase: string;
  variant: string | null;
  reps: number;
  fpsMedian: number | null;
  fpsP5: number | null;
  fpsP1: number | null;
  fpsMean: number | null;
  slowFrameShare: number | null;
  framesOver50: number | null;
  longTasks: number | null;
  heapMaxMb: number | null;
  gpuEstimateMb: number | null;
  repaintsPerSecond: number | null;
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
  layoutMs: number | null;
  totalMs: number | null;
}

export interface MachineInfo {
  machine: string;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  cpuThreads: number | null;
  deviceMemoryGb: number | null;
  browser: string;
  platform: string | null;
  screen: string;
  dpr: number | null;
  refreshHz: number | null;
  builds: string[];
  files: string[];
}

export interface AggregateReport {
  options: AggregateOptions;
  files: number;
  excluded: Array<{ file: string; reason: string }>;
  machines: MachineInfo[];
  phases: PhaseAggregate[];
  loads: LoadAggregate[];
  failures: Array<{
    machine: string;
    file: string;
    scenario: string;
    status: string;
    error: string;
  }>;
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
  a: Pick<PhaseAggregate, "agents" | "density" | "phase" | "variant" | "source">,
  b: Pick<PhaseAggregate, "agents" | "density" | "phase" | "variant" | "source">,
): number {
  return (
    a.source.localeCompare(b.source) ||
    a.agents - b.agents ||
    (a.density ?? 0) - (b.density ?? 0) ||
    PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
    speedOrder(a.variant) - speedOrder(b.variant) ||
    (a.variant ?? "").localeCompare(b.variant ?? "")
  );
}

export function aggregateResults(
  results: readonly LoadedResult[],
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS,
): AggregateReport {
  const excluded: AggregateReport["excluded"] = [];
  const rows: CsvRow[] = [];
  const machines = new Map<string, MachineInfo>();
  const failures: AggregateReport["failures"] = [];

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
      cpuThreads: doc.environment.hardwareConcurrency,
      deviceMemoryGb: doc.environment.deviceMemoryGb,
      browser: String(docRows[0]?.browser ?? ""),
      platform: doc.environment.userAgentData?.platform ?? null,
      screen: `${doc.environment.screen.width}x${doc.environment.screen.height}`,
      dpr: doc.environment.devicePixelRatio,
      refreshHz: doc.environment.refreshRateHzEst,
      builds: [],
      files: [],
    };
    const build = `${doc.build.appVersion} (${doc.build.gitCommit}${doc.build.gitDirty ? ", dirty" : ""})`;
    if (!info.builds.includes(build)) info.builds.push(build);
    info.files.push(file);
    machines.set(machine, info);
    for (const s of doc.scenarios) {
      if (s.status !== "ok") {
        failures.push({ machine, file, scenario: s.id, status: s.status, error: s.error ?? "" });
      }
    }
  }

  const okRows = rows.filter((r) => r.status === "ok" && r.phase !== null);
  const phaseGroups = new Map<string, CsvRow[]>();
  for (const r of okRows) {
    const key = [r.machine, r.source, r.agents, r.density, r.phase, r.variant].join("|");
    const group = phaseGroups.get(key) ?? [];
    group.push(r);
    phaseGroups.set(key, group);
  }
  const phases: PhaseAggregate[] = [];
  for (const group of phaseGroups.values()) {
    const first = group[0] as CsvRow;
    const fpsMedian = medianOf(group.map((r) => r.fps_median));
    phases.push({
      machine: String(first.machine),
      source: String(first.source),
      agents: Number(first.agents),
      density: num(first.density),
      edges: medianOf(group.map((r) => r.edges)),
      phase: String(first.phase),
      variant: first.variant === null ? null : String(first.variant),
      reps: group.length,
      fpsMedian,
      fpsP5: medianOf(group.map((r) => r.fps_p5)),
      fpsP1: medianOf(group.map((r) => r.fps_p1)),
      fpsMean: medianOf(group.map((r) => r.fps_mean)),
      slowFrameShare: medianOf(group.map((r) => r.slow_frame_share_33ms)),
      framesOver50: medianOf(group.map((r) => r.frames_over_50ms)),
      longTasks: medianOf(group.map((r) => r.long_tasks)),
      heapMaxMb: maxOf(group.map((r) => r.heap_max_mb)),
      gpuEstimateMb: medianOf(group.map((r) => r.gpu_mem_estimate_mb)),
      repaintsPerSecond: medianOf(group.map((r) => r.repaints_per_s)),
      pass: fpsMedian === null ? null : fpsMedian > options.threshold,
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

  return {
    options,
    files: results.length,
    excluded,
    machines: [...machines.values()].sort((a, b) => a.machine.localeCompare(b.machine)),
    phases,
    loads,
    failures,
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

function mdTable(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(header), `|${header.map(() => " --- ").join("|")}|`, ...rows.map(line)].join("\n");
}

export function renderMarkdown(report: AggregateReport, generatedAt: string): string {
  const out: string[] = [];
  const t = report.options.threshold;
  out.push("# SiLEnSeSS rendering benchmark report", "");
  out.push(
    `Generated ${generatedAt} from ${report.files} result file(s) by \`benchmarks/scripts/aggregate.ts\`.`,
    `Values are medians over repetitions; FPS percentiles come from frame-time percentiles (p5 FPS = 1000 / p95 frame time).`,
    `**Pass** = median FPS strictly greater than ${t} (OE3). GPU memory is an **estimate** from buffer sizes, not a measurement.`,
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
      `- CPU threads: ${machine.cpuThreads ?? "unknown"} · device memory: ${machine.deviceMemoryGb !== null ? `${machine.deviceMemoryGb} GB (browser-capped)` : "unknown"}`,
      `- Browser: ${machine.browser || "unknown"} · platform: ${machine.platform ?? "unknown"}`,
      `- Screen: ${machine.screen} @ DPR ${machine.dpr ?? "?"} · refresh ≈ ${fmt(machine.refreshHz, 0)} Hz`,
      `- Builds: ${machine.builds.join(", ")}`,
      `- Files: ${machine.files.map((f) => `\`${f}\``).join(", ")}`,
      "",
    );

    const phases = report.phases.filter((p) => p.machine === machine.machine);
    out.push("### Frame rate by size × density × phase", "");
    out.push(
      mdTable(
        [
          "Source",
          "Agents",
          "Density",
          "Edges",
          "Phase",
          "Reps",
          "Median FPS",
          "p5 FPS",
          "p1 FPS",
          "Frames > 33.3 ms",
          "Frames > 50 ms",
          "Heap max (MB)",
          "GPU est. (MB)",
          `> ${t} FPS`,
        ],
        phases.map((p) => [
          p.source,
          int(p.agents),
          p.density === null ? "–" : String(p.density),
          int(p.edges),
          phaseLabel(p),
          String(p.reps),
          fmt(p.fpsMedian),
          fmt(p.fpsP5),
          fmt(p.fpsP1),
          pct(p.slowFrameShare),
          fmt(p.framesOver50, 0),
          fmt(p.heapMaxMb, 0),
          fmt(p.gpuEstimateMb, 0),
          p.pass === null ? "n/a" : p.pass ? "PASS" : "FAIL",
        ]),
      ),
      "",
    );

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
          int(l.layoutMs),
          int(l.totalMs),
        ]),
      ),
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
  "edges",
  "phase",
  "variant",
  "reps",
  "fps_median",
  "fps_p5",
  "fps_p1",
  "fps_mean",
  "slow_frame_share_33ms",
  "frames_over_50ms",
  "long_tasks",
  "heap_max_mb",
  "gpu_mem_estimate_mb",
  "repaints_per_s",
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
  "layout_ms",
  "total_ms",
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
      edges: p.edges,
      phase: p.phase,
      variant: p.variant,
      reps: p.reps,
      fps_median: r2(p.fpsMedian),
      fps_p5: r2(p.fpsP5),
      fps_p1: r2(p.fpsP1),
      fps_mean: r2(p.fpsMean),
      slow_frame_share_33ms: p.slowFrameShare === null ? null : Number(p.slowFrameShare.toFixed(4)),
      frames_over_50ms: p.framesOver50,
      long_tasks: p.longTasks,
      heap_max_mb: p.heapMaxMb,
      gpu_mem_estimate_mb: p.gpuEstimateMb,
      repaints_per_s: r2(p.repaintsPerSecond),
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
      layout_ms: r2(l.layoutMs),
      total_ms: r2(l.totalMs),
    })),
  );
}
