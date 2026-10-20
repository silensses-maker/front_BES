import { describe, expect, it } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase, fakeScenario } from "@/test/bench-fixtures";
import {
  browserLabel,
  CSV_COLUMNS,
  csvField,
  flattenResult,
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
      schema_version: 1,
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
