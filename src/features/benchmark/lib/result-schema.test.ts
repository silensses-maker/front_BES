import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDocument, fakeEnvironment, fakePhase, fakeScenario } from "@/test/bench-fixtures";
import {
  BENCH_HARNESS_MARKER,
  BENCH_SCHEMA_VERSION,
  createResultDocument,
  newResultId,
  resultFileStem,
  validateResultDocument,
} from "./result-schema";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateResultDocument", () => {
  const valid = fakeDocument([fakeScenario(10_000, 3, 1, [fakePhase("idle", 60)])]);

  it("accepts well-formed version 1 and 2 documents", () => {
    expect(validateResultDocument(JSON.parse(JSON.stringify(valid))).ok).toBe(true);
    expect(validateResultDocument({ ...valid, schemaVersion: 1 }).ok).toBe(true);
    expect(BENCH_SCHEMA_VERSION).toBe(2);
  });

  it.each([
    ["not an object", [], "not a JSON object"],
    ["wrong marker", { ...valid, harness: "other" }, "not a benchmark result"],
    [
      "future schema",
      { ...valid, schemaVersion: 3 },
      "unsupported schemaVersion 3 (supported: 1, 2)",
    ],
    [
      "missing schema",
      { ...valid, schemaVersion: "2" },
      "unsupported schemaVersion 2 (supported: 1, 2)",
    ],
    ["unknown kind", { ...valid, kind: "x" }, "unknown kind"],
    ["no build", { ...valid, build: null }, "missing build or environment"],
    ["no scenarios", { ...valid, scenarios: {} }, "missing scenarios"],
    [
      "bad scenario",
      { ...valid, scenarios: [{ id: "a", agents: 1, phases: [] }] },
      "malformed scenario",
    ],
    [
      "bad scenario id",
      { ...valid, scenarios: [{ id: 1, agents: 1, phases: [], load: {} }] },
      "malformed scenario",
    ],
    [
      "bad phase",
      { ...valid, scenarios: [{ id: "a", agents: 1, phases: [{ phase: "idle" }], load: {} }] },
      "malformed phase in scenario a",
    ],
  ])("rejects %s", (_name, raw, error) => {
    expect(validateResultDocument(raw)).toEqual({ ok: false, error });
  });
});

describe("createResultDocument", () => {
  it("starts an incomplete, versioned document", () => {
    const doc = createResultDocument({
      kind: "suite",
      build: fakeDocument([]).build,
      environment: fakeEnvironment(),
      config: { seed: 1 },
      startedAt: new Date("2026-10-19T10:00:00.000Z"),
      id: "x",
    });
    expect(doc).toMatchObject({
      schemaVersion: BENCH_SCHEMA_VERSION,
      harness: BENCH_HARNESS_MARKER,
      id: "x",
      startedAt: "2026-10-19T10:00:00.000Z",
      finishedAt: null,
      complete: false,
      scenarios: [],
      warnings: [],
    });
    expect(validateResultDocument(doc).ok).toBe(true);
  });
});

describe("newResultId", () => {
  it("uses randomUUID when available and falls back otherwise", () => {
    expect(newResultId()).toMatch(/^[0-9a-f-]{36}$/);
    vi.stubGlobal("crypto", undefined);
    expect(newResultId()).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe("resultFileStem", () => {
  it("encodes kind, start time and commit", () => {
    const doc = fakeDocument([]);
    expect(resultFileStem(doc)).toBe("bench-2026-10-19T20-15-03-ed59e82");
    expect(resultFileStem({ ...doc, kind: "hud-record" })).toBe("hud-2026-10-19T20-15-03-ed59e82");
  });
});
