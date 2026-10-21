import { describe, expect, it } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase, fakeScenario } from "@/test/bench-fixtures";
import {
  aggregateResults,
  comparePhases,
  DEFAULT_AGGREGATE_OPTIONS,
  exclusionReason,
  LINKS_COLUMNS,
  LOAD_COLUMNS,
  linearFit,
  linksCsv,
  loadCsv,
  renderMarkdown,
  SUMMARY_COLUMNS,
  summaryCsv,
  twoFactorFit,
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
    expect(idle?.fpsMean).toBeCloseTo(50);
    expect(idle?.frameMsMean).toBeCloseTo(20);
    expect(idle).toMatchObject({ canvasVariant: "baseline", comparable: true, links: 599_988 });
    expect(idle?.entities).toBe(699_988);
    const repaint = report.phases.find((p) => p.agents === 100_000 && p.phase === "repaint");
    expect(repaint?.fpsMean).toBeCloseTo(30);
    expect(repaint?.pass).toBe(false); // mean FPS strictly greater than 30
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
    expect(md).toContain("**Headline: mean FPS**");
    expect(md).toContain("**Pass** = mean FPS strictly greater than 30");
    expect(md).toContain("GPU memory is an **estimate**");
    expect(md).toContain("`dev.json`: development build");
    expect(md).toContain("### Frame rate by size × density × phase (baseline canvas)");
    expect(md).toContain(
      "| synthetic | 100,000 | 3 | 599,988 | 699,988 | repaint (x16) | 3 | 30.0 | 30.0 | 30.0 | 30.0 |",
    );
    expect(md).toContain("### Frame rate vs rendered links (baseline canvas)");
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

describe("schema 1 files", () => {
  it("keep their layout windows out of pass/fail", () => {
    const report = aggregateResults([
      {
        file: "v1.json",
        doc: fakeDocument(
          [fakeScenario(10_000, 2, 1, [fakePhase("layout", 160), fakePhase("idle", 160)])],
          { schemaVersion: 1 },
        ),
      },
    ]);
    const layout = report.phases.find((p) => p.phase === "layout");
    expect(layout).toMatchObject({ comparable: false, pass: null });
    expect(report.phases.find((p) => p.phase === "idle")?.pass).toBe(true);
    const md = renderMarkdown(report, "now");
    expect(md).toMatch(/\| layout \| 1 \| 160\.0 .*\| n\/c¹ \|/);
    expect(md).toContain("¹ Schema v1");
    expect(md).toContain("GPU used by the canvas: not recorded (schema v1)");
  });
});

describe("repaint breakdown of the direct path (#142)", () => {
  const stat = (median: number) => ({ median, p95: median, mean: median });
  const none = { median: null, p95: null, mean: null };
  const repaintPhase = (path: "direct" | "fallback", skipped: number) =>
    fakePhase("repaint", 55, {
      variant: "x16",
      repaint: {
        speed: 16,
        targetRoundsPerSecond: 160,
        roundsRendered: 550,
        repaintsPerSecond: 55,
        breakdown: {
          rounds: 550,
          mergeMs: stat(1),
          commitMs: stat(2),
          cosmographUpdates: 0,
          cosmographUpdateMs: none,
          cosmographSyncMs: none,
          colorUpdates: 0,
          repaintPath: path,
          directRepaints: 540,
          bufferBuildMs: stat(1.5),
          bufferPushMs: stat(2.25),
          skippedRounds: skipped,
          frameMs: 18,
          longTaskMsPerSecond: 0,
        },
      },
    });

  it("lists the direct rows (no Cosmograph update) with build, push and skipped rounds", () => {
    const doc = fakeDocument([
      fakeScenario(100_000, 3, 1, [fakePhase("idle", 60), repaintPhase("direct", 4)]),
      fakeScenario(100_000, 3, 2, [fakePhase("idle", 60), repaintPhase("direct", 6)]),
    ]);
    const report = aggregateResults([{ file: "direct.json", doc }]);
    const repaint = report.phases.find((p) => p.phase === "repaint");
    expect(repaint).toMatchObject({
      rbPath: "direct",
      rbBuildMs: 1.5,
      rbPushMs: 2.25,
      rbSkipped: 5,
    });
    const md = renderMarkdown(report, "now");
    expect(md).toMatch(
      /\| x16 \| [\d.]+ \| [\d.]+ \| [\d.]+ \| 1\.00 \| 2\.0 \| direct \| 1\.50 \| 2\.25 \| 5 \| – \|/,
    );
  });

  it("marks repetitions that took different paths as mixed", () => {
    const doc = fakeDocument([
      fakeScenario(100_000, 3, 1, [repaintPhase("direct", 0)]),
      fakeScenario(100_000, 3, 2, [repaintPhase("fallback", 0)]),
    ]);
    const report = aggregateResults([{ file: "mixed.json", doc }]);
    expect(report.phases.find((p) => p.phase === "repaint")?.rbPath).toBe("mixed");
  });
});

describe("links, variants and repaint breakdown", () => {
  const stat = (median: number) => ({ median, p95: median * 1.5, mean: median });
  const breakdown = (update: number) => ({
    rounds: 90,
    mergeMs: stat(1.5),
    commitMs: stat(4),
    cosmographUpdates: 90,
    cosmographUpdateMs: stat(update),
    cosmographSyncMs: stat(3),
    colorUpdates: 90,
    frameMs: 100,
    longTaskMsPerSecond: 800,
  });
  // frame time ≈ 2 ms + 5 ms per 100k links (and no per-agent cost) on a 60 Hz display
  const fpsFor = (links: number) => 1000 / (2 + (5 * links) / 100_000);
  const scenario = (agents: number, density: number) => {
    const links = density * (density - 1) + (agents - density) * 2 * density;
    return fakeScenario(agents, density, 1, [
      fakePhase("idle", fpsFor(links)),
      fakePhase("interaction", fpsFor(links) * 1.2),
      fakePhase("repaint", 10, {
        variant: "x1",
        repaint: {
          speed: 1,
          targetRoundsPerSecond: 10,
          roundsRendered: 90,
          repaintsPerSecond: 9,
          breakdown: breakdown(agents / 1_000),
        },
      }),
      fakePhase("idle", fpsFor(links) * 2, {
        canvasVariant: "links-off",
        links: { inData: links, drawn: 0 },
      }),
      fakePhase("idle", fpsFor(links / 2), {
        canvasVariant: "one-link-per-pair",
        links: { inData: links / 2, drawn: links / 2 },
      }),
    ]);
  };
  const doc = fakeDocument([
    scenario(10_000, 2),
    scenario(50_000, 3),
    scenario(100_000, 2),
    scenario(100_000, 3),
    scenario(150_000, 5),
  ]);
  const report = aggregateResults([{ file: "v2.json", doc }]);

  it("fits frame time on links and finds the 30 FPS crossing", () => {
    const idle = report.links.find((a) => a.phase === "idle");
    expect(idle?.points.map((p) => p.linksDrawn)).toEqual([
      39_994, 299_988, 399_994, 599_988, 1_499_970,
    ]);
    // the two smallest networks run above 90 % of 60 Hz: display-capped, left out of the fit
    expect(idle?.fitted).toBe(3);
    // (the CSV rounds FPS to 2 decimals, hence the loose precision)
    expect(idle?.fit?.slope).toBeCloseTo(5 / 100_000, 6);
    expect(idle?.fit?.intercept).toBeCloseTo(2, 1);
    expect(idle?.fit?.r2).toBeCloseTo(1, 3);
    expect((idle?.crossingLinks ?? 0) / ((1000 / 30 - 2) / (5 / 100_000))).toBeCloseTo(1, 2);
    expect(idle?.highestPassingLinks).toBe(599_988);
    expect(idle?.lowestFailingLinks).toBe(1_499_970);
    expect(idle?.fit2).toBeNull(); // 3 uncapped points: too few for two factors
    expect(report.links.map((a) => `${a.phase}:${a.variant}`)).toEqual([
      "idle:null",
      "interaction:null",
      "repaint:x1",
    ]);
  });

  it("renders the link, variant and repaint sections", () => {
    const md = renderMarkdown(report, "now");
    expect(md).toContain("#### idle");
    expect(md).toMatch(
      /Fit over 3 point\(s\): frame ≈ 2\.0\d ms \+ 5\.00 ms per 100k links \(R² = 1\.000\)/,
    );
    expect(md).toContain("### Canvas variants (LOD study, #50)");
    expect(md).toMatch(
      /\| 100,000 \| 3 \| 599,988 \| idle \| [\d.]+ \| – \| [\d.]+ \(\+100 %\) \|/,
    );
    expect(md).toContain("### Repaint breakdown (per round, medians)");
    expect(md).toMatch(
      /\| 100,000 \| 3 \| 599,988 \| x1 \| 9\.0 \| 100\.0 \| [\d.]+ \| 1\.50 \| 4\.0 \| – \| – \| – \| – \| 100\.0 \| 150\.0 \| 3\.0 \| 800 \|/,
    );
  });

  it("writes links.csv sorted by phase, canvas variant and links", () => {
    const lines = linksCsv(report).trimEnd().split("\r\n");
    expect(lines[0]).toBe(LINKS_COLUMNS.join(","));
    const idleBaseline = lines.filter((l) => l.includes(",idle,,baseline,"));
    expect(idleBaseline).toHaveLength(5);
    expect(idleBaseline[0]).toContain(",39994,39994,10000,2,");
  });
});

describe("fits", () => {
  it("need distinct points", () => {
    expect(linearFit([{ x: 1, y: 2 }])).toBeNull();
    expect(
      linearFit([
        { x: 1, y: 2 },
        { x: 1, y: 3 },
      ]),
    ).toBeNull();
    expect(
      linearFit([
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ])?.r2,
    ).toBe(1);
    expect(twoFactorFit([{ a: 1, b: 2, y: 3 }])).toBeNull();
    expect(
      twoFactorFit([
        { a: 1, b: 1, y: 1 },
        { a: 2, b: 2, y: 2 },
        { a: 3, b: 3, y: 3 },
        { a: 4, b: 4, y: 4 },
      ]),
    ).toBeNull();
    const plane = twoFactorFit([
      { a: 0, b: 0, y: 1 },
      { a: 1, b: 0, y: 3 },
      { a: 0, b: 1, y: 6 },
      { a: 1, b: 1, y: 8 },
      { a: 2, b: 3, y: 20 },
    ]);
    expect(plane?.intercept).toBeCloseTo(1);
    expect(plane?.perAgent).toBeCloseTo(2);
    expect(plane?.perLink).toBeCloseTo(5);
    expect(plane?.r2).toBeCloseTo(1);
  });
});

describe("analyseLinks without a crossing", () => {
  it("reports none when the fit is already above the budget at zero links", () => {
    const doc = fakeDocument([
      fakeScenario(1_000, 2, 1, [fakePhase("idle", 10)]),
      fakeScenario(5_000, 2, 1, [fakePhase("idle", 5)]),
    ]);
    const report = aggregateResults([{ file: "slow.json", doc }]);
    const idle = report.links.find((a) => a.phase === "idle");
    expect(idle?.fit?.slope).toBeGreaterThan(0);
    expect(idle?.crossingLinks).toBeNull();
    expect(renderMarkdown(report, "now")).toContain("no crossing");
  });
});
