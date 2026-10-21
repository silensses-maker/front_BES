import { describe, expect, it } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase, fakeScenario } from "@/test/bench-fixtures";
import {
  browserLabel,
  CSV_COLUMNS,
  csvField,
  flattenResult,
  isWindowComparable,
  resultToCsv,
  toCsv,
} from "./result-csv";

describe("csvField", () => {
  it("quotes per RFC 4180", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(12.5)).toBe("12.5");
    expect(csvField(true)).toBe("true");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });
});

describe("flattenResult", () => {
  const doc = fakeDocument([
    fakeScenario(10_000, 3, 1, [
      fakePhase("idle", 60),
      fakePhase("repaint", 30, {
        variant: "x16",
        repaint: {
          speed: 16,
          targetRoundsPerSecond: 160,
          roundsRendered: 300,
          repaintsPerSecond: 30,
        },
        uaMemory: { status: "ok", bytes: 512 * 1024 * 1024 },
      }),
    ]),
    fakeScenario(150_000, 5, 1, [], { status: "error", error: "canvas did not freeze" }),
  ]);

  it("emits one row per scenario × phase and one per failed scenario", () => {
    const rows = flattenResult(doc);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      result_id: "doc-1",
      schema_version: 2,
      canvas_variant: "baseline",
      links_in_data: 59_988,
      links_drawn: 59_988,
      rendered_entities: 69_988,
      window_comparable: true,
      build_mode: "production",
      git_commit: "ed59e82abcde",
      gpu_renderer: "NVIDIA GeForce RTX 3060",
      browser: "Google Chrome 130.0.6723.70",
      agents: 10_000,
      density: 3,
      phase: "idle",
      fps_median: 60,
      slow_frame_share_33ms: 0,
      heap_max_mb: 200,
      gpu_mem_estimate_mb: 64,
      load_generate_ms: 100,
      stage: "1280x720@1",
      screen: "1920x1080",
    });
    expect(rows[1]).toMatchObject({
      phase: "repaint",
      variant: "x16",
      repaint_speed: 16,
      repaint_rounds_rendered: 300,
      repaints_per_s: 30,
      ua_memory_status: "ok",
      ua_memory_mb: 512,
    });
    expect(rows[2]).toMatchObject({ status: "error", error: "canvas did not freeze", phase: null });
  });

  it("serialises with the full header, CRLF line ends and quoted fields", () => {
    const csv = resultToCsv(doc);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(4);
    expect(lines[1]?.split(",").length).toBeGreaterThanOrEqual(CSV_COLUMNS.length);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("marks long tasks as unknown where unsupported", () => {
    const rows = flattenResult(
      fakeDocument([
        fakeScenario(1_000, 2, 1, [
          fakePhase("idle", 60, {
            longTasks: { supported: false, count: 0, totalMs: 0, maxMs: 0 },
          }),
        ]),
      ]),
    );
    expect(rows[0]?.long_tasks).toBeNull();
  });
});

describe("version 2 fields", () => {
  it("flattens canvas variants, the layout lead, the repaint breakdown and the upload", () => {
    const stat = { median: 2, p95: 3, mean: 2.5 };
    const doc = fakeDocument([
      fakeScenario(
        100_000,
        3,
        1,
        [
          fakePhase("layout", 40, {
            lead: {
              label: "upload",
              durationMs: 1_234.56,
              startedBy: "first-tick",
              frames: 12,
              maxFrameMs: 900,
              longTasks: { supported: true, count: 2, totalMs: 1_100, maxMs: 900 },
            },
          }),
          fakePhase("idle", 50, {
            canvasVariant: "links-off",
            links: { inData: 599_988, drawn: 0 },
          }),
          fakePhase("repaint", 10, {
            variant: "x1",
            repaint: {
              speed: 1,
              targetRoundsPerSecond: 10,
              roundsRendered: 95,
              repaintsPerSecond: 9.5,
              breakdown: {
                rounds: 95,
                mergeMs: stat,
                commitMs: stat,
                cosmographUpdates: 90,
                cosmographUpdateMs: { median: 80, p95: 120, mean: 85 },
                cosmographSyncMs: stat,
                colorUpdates: 90,
                frameMs: 100,
                longTaskMsPerSecond: 812.34,
              },
            },
          }),
        ],
        {
          canvasRenderer: "ANGLE (NVIDIA RTX 3070)",
          load: {
            ...fakeScenario(1, 1, 1, []).load,
            uploadMs: 1_234.5,
            uploadLongTasks: 2,
            uploadLongTaskMs: 1_100,
            uploadMaxFrameMs: 900,
          },
        },
      ),
    ]);
    const [layout, idle, repaint] = flattenResult(doc);
    expect(layout).toMatchObject({
      lead_label: "upload",
      lead_started_by: "first-tick",
      lead_ms: 1_234.6,
      lead_long_tasks: 2,
      lead_long_task_ms: 1_100,
      load_upload_ms: 1_234.5,
      load_upload_long_tasks: 2,
      canvas_renderer: "ANGLE (NVIDIA RTX 3070)",
      window_comparable: true,
    });
    expect(idle).toMatchObject({
      canvas_variant: "links-off",
      links_in_data: 599_988,
      links_drawn: 0,
      rendered_entities: 100_000,
    });
    expect(repaint).toMatchObject({
      rb_rounds: 95,
      rb_cosmograph_update_ms_median: 80,
      rb_cosmograph_update_ms_p95: 120,
      rb_long_task_ms_per_s: 812.3,
      frame_ms_mean: 100,
      // a breakdown recorded before #142 has no repaint path
      rb_repaint_path: null,
      rb_direct_repaints: null,
      rb_buffer_build_ms_median: null,
      rb_skipped_rounds: null,
    });
  });

  it("flattens the direct repaint timings (#142)", () => {
    const stat = (median: number) => ({ median, p95: median, mean: median });
    const doc = fakeDocument([
      fakeScenario(100_000, 3, 1, [
        fakePhase("repaint", 60, {
          variant: "x16",
          repaint: {
            speed: 16,
            targetRoundsPerSecond: 160,
            roundsRendered: 590,
            repaintsPerSecond: 59,
            breakdown: {
              rounds: 590,
              mergeMs: stat(1),
              commitMs: stat(2),
              cosmographUpdates: 0,
              cosmographUpdateMs: { median: null, p95: null, mean: null },
              cosmographSyncMs: { median: null, p95: null, mean: null },
              colorUpdates: 0,
              repaintPath: "direct",
              directRepaints: 580,
              bufferBuildMs: stat(1.23456),
              bufferPushMs: stat(2.5),
              skippedRounds: 10,
              frameMs: 16.7,
              longTaskMsPerSecond: 0,
            },
          },
        }),
      ]),
    ]);
    expect(flattenResult(doc)[0]).toMatchObject({
      rb_repaint_path: "direct",
      rb_direct_repaints: 580,
      rb_buffer_build_ms_median: 1.235,
      rb_buffer_push_ms_median: 2.5,
      rb_skipped_rounds: 10,
      rb_cosmograph_update_ms_median: null,
    });
  });

  it("marks version 1 layout windows as not comparable", () => {
    const v1 = fakeDocument(
      [
        fakeScenario(1_000, 2, 1, [
          fakePhase("layout", 60),
          fakePhase("cluster-layout", 60),
          fakePhase("idle", 60),
        ]),
      ],
      { schemaVersion: 1 },
    );
    expect(flattenResult(v1).map((r) => r.window_comparable)).toEqual([false, false, true]);
    expect(isWindowComparable(2, "layout")).toBe(true);
  });
});

describe("toCsv", () => {
  it("writes the given columns in order", () => {
    expect(toCsv(["a", "b"] as const, [{ a: 1, b: "x,y" }])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

describe("browserLabel", () => {
  it("prefers the full version of the real brand", () => {
    expect(browserLabel({ environment: fakeEnvironment() })).toBe("Google Chrome 130.0.6723.70");
    expect(
      browserLabel({
        environment: fakeEnvironment({
          userAgentData: { brands: ["Chromium 130"], mobile: false, platform: "Linux" },
        }),
      }),
    ).toBe("Chromium 130");
    expect(browserLabel({ environment: fakeEnvironment({ userAgentData: null }) })).toBe("");
  });
});
