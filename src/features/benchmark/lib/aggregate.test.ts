import { describe, expect, it } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase, fakeScenario } from "@/test/bench-fixtures";
import {
  aggregateResults,
  comparePhases,
  DEFAULT_AGGREGATE_OPTIONS,
  exclusionReason,
  LOAD_COLUMNS,
  loadCsv,
  renderMarkdown,
  SUMMARY_COLUMNS,
  summaryCsv,
} from "./aggregate";

const repsDoc = fakeDocument([
  fakeScenario(100_000, 3, 1, [
    fakePhase("idle", 60),
    fakePhase("repaint", 24, { variant: "x16" }),
  ]),
  fakeScenario(100_000, 3, 2, [
    fakePhase("idle", 50),
    fakePhase("repaint", 30, { variant: "x16" }),
  ]),
  fakeScenario(100_000, 3, 3, [
    fakePhase("idle", 40),
    fakePhase("repaint", 36, { variant: "x16" }),
  ]),
  fakeScenario(10_000, 2, 1, [
    fakePhase("repaint", 60, { variant: "x1" }),
    fakePhase("layout", 20),
  ]),
  fakeScenario(150_000, 5, 1, [], { status: "error", error: "canvas did not freeze" }),
]);

describe("exclusionReason", () => {
  it("keeps optimized real-GPU results only (unless asked otherwise)", () => {
    expect(exclusionReason(repsDoc, DEFAULT_AGGREGATE_OPTIONS)).toBeNull();
    const dev = fakeDocument([], { build: { ...repsDoc.build, mode: "development" } });
    expect(exclusionReason(dev, DEFAULT_AGGREGATE_OPTIONS)).toMatch(/development build/);
    expect(exclusionReason(dev, { ...DEFAULT_AGGREGATE_OPTIONS, includeDev: true })).toBeNull();
    const sw = fakeDocument([], {
      environment: fakeEnvironment({
        gpu: { ...fakeEnvironment().gpu, renderer: "SwiftShader", softwareRendering: true },
      }),
    });
    expect(exclusionReason(sw, DEFAULT_AGGREGATE_OPTIONS)).toMatch(
      /software rendering \(SwiftShader\)/,
    );
    expect(exclusionReason(sw, { ...DEFAULT_AGGREGATE_OPTIONS, includeSoftware: true })).toBeNull();
  });
});

describe("aggregateResults", () => {
  const report = aggregateResults([
    { file: "a.json", doc: repsDoc },
    {
      file: "dev.json",
      doc: fakeDocument([fakeScenario(1_000, 2, 1, [fakePhase("idle", 10)])], {
        build: { ...repsDoc.build, mode: "development" },
      }),
    },
  ]);

  it("groups by machine × size × density × phase and takes medians over repetitions", () => {
    expect(report.files).toBe(2);
    expect(report.excluded).toEqual([
      { file: "dev.json", reason: expect.stringMatching(/development/) },
    ]);
    expect(report.machines).toHaveLength(1);
    expect(report.machines[0]?.builds).toEqual(["2.0.13 (ed59e82abcde)"]);
    const idle = report.phases.find((p) => p.agents === 100_000 && p.phase === "idle");
    expect(idle).toMatchObject({ reps: 3, density: 3, variant: null, heapMaxMb: 200, pass: true });
    expect(idle?.fpsMedian).toBeCloseTo(50);
    const repaint = report.phases.find((p) => p.agents === 100_000 && p.phase === "repaint");
    expect(repaint?.fpsMedian).toBeCloseTo(30);
    expect(repaint?.pass).toBe(false); // strictly greater than 30
    expect(repaint?.variant).toBe("x16");
  });

  it("orders rows by size, density and phase", () => {
    expect(report.phases.map((p) => `${p.agents}:${p.phase}`)).toEqual([
      "10000:layout",
      "10000:repaint",
      "100000:idle",
      "100000:repaint",
    ]);
  });

  it("reports one load row per size × density and the failed scenarios", () => {
    expect(report.loads.map((l) => [l.agents, l.scenarios])).toEqual([
      [10_000, 1],
      [100_000, 3],
    ]);
    expect(report.loads[1]?.generateMs).toBe(200);
    expect(report.failures).toEqual([
      {
        machine: report.machines[0]?.machine,
        file: "a.json",
        scenario: "n150000-d5-r1",
        status: "error",
        error: "canvas did not freeze",
      },
    ]);
    expect(report.rows).toHaveLength(9);
  });

  it("renders Markdown tables with pass/fail and the estimate disclaimer", () => {
    const md = renderMarkdown(report, "2026-10-19T00:00:00.000Z");
    expect(md).toContain("# SiLEnSeSS rendering benchmark report");
    expect(md).toContain("**Pass** = median FPS strictly greater than 30");
    expect(md).toContain("GPU memory is an **estimate**");
    expect(md).toContain("`dev.json`: development build");
    expect(md).toContain("### Frame rate by size × density × phase");
    expect(md).toContain("| synthetic | 100,000 | 3 | 599,988 | repaint (x16) | 3 | 30.0 |");
    expect(md).toMatch(/\| PASS \|/);
    expect(md).toMatch(/\| FAIL \|/);
    expect(md).toContain("### Load timings (median ms)");
    expect(md).toContain("### Failed scenarios");
    expect(md).toContain("`n150000-d5-r1` (a.json): error — canvas did not freeze");
  });

  it("writes the summary and load CSVs", () => {
    const summary = summaryCsv(report).trimEnd().split("\r\n");
    expect(summary[0]).toBe(SUMMARY_COLUMNS.join(","));
    expect(summary).toHaveLength(1 + report.phases.length);
    const load = loadCsv(report).trimEnd().split("\r\n");
    expect(load[0]).toBe(LOAD_COLUMNS.join(","));
    expect(load).toHaveLength(1 + report.loads.length);
  });

  it("renders an empty report", () => {
    const empty = aggregateResults([]);
    expect(renderMarkdown(empty, "now")).toContain("_No results to report._");
  });
});

describe("comparePhases", () => {
  it("sorts repaint speeds numerically", () => {
    const base = { source: "synthetic", agents: 1, density: 2, phase: "repaint" };
    const rows = ["x16", "x1", "x4"].map((variant) => ({ ...base, variant }));
    expect(rows.sort(comparePhases).map((r) => r.variant)).toEqual(["x1", "x4", "x16"]);
    expect(
      comparePhases({ ...base, variant: "belief" }, { ...base, variant: "effect" }),
    ).toBeLessThan(0);
  });
});
