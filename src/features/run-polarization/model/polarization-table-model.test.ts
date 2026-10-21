import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real stores; the entity index (Firebase-touching ws module) stays out.
vi.mock("@/entities/simulation", async () => ({
  useSimulationStore: (
    await vi.importActual<typeof import("../../../entities/simulation/model/simulation.store")>(
      "../../../entities/simulation/model/simulation.store",
    )
  ).useSimulationStore,
  useRoundAggregatesStore: (
    await vi.importActual<
      typeof import("../../../entities/simulation/model/round-aggregates.store")
    >("../../../entities/simulation/model/round-aggregates.store")
  ).useRoundAggregatesStore,
}));

// The server: pol_measures behind POST /simulations/polarization.
vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { computePolarization: vi.fn(), getPolarizationMeasures: vi.fn() },
}));

import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import {
  type PolarizationCatalog,
  type PolarizationRequest,
  type PolarizationResult,
  simulationsApi,
} from "@/shared/api/backend";
import { FINE_BINS, FineHistogramPool } from "@/shared/lib/polarization";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { polarizationCsv } from "../lib/polarization-csv";
import { tableRounds } from "../lib/polarization-table";
import type { SeriesLabelText } from "../lib/series-label";
import { allMeasureEntries, allMeasureSpecs } from "./all-measures";
import { compareSeries } from "./compared-series";
import { PolarizationSeries } from "./polarization-series";
import { defaultSettings, usePolarizationSettingsStore } from "./polarization-settings.store";
import {
  addSeries,
  fromSingleSeries,
  MAX_SERIES,
  overlayAllMeasures,
  updateSeries,
} from "./series-list";
import type { SpecEntry } from "./series-scheduler";
import { isPartial, measureColumns, seriesColumns } from "./table-columns";
import { usePolarizationSeriesList } from "./use-polarization-series";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

const TEXT: SeriesLabelText = {
  lang: "en",
  belief: (belief) => belief,
  auto: "auto",
  alienations: catalog.alienations,
};
const PALETTE = ["#111", "#222", "#333", "#444"];

/** A fake server: value = share of the agents in the first category. */
function fakeServer() {
  return vi.fn(
    async (body: PolarizationRequest): Promise<PolarizationResult> => ({
      values: body.histograms.map((h) => (h[0] as number) / h.reduce((a, b) => a + b, 0)),
      levels: body.histograms.map(() => null),
      classification: null,
      unique: body.histograms.length,
      package: { ref: "0e05564", version: "0.1.0a2" },
    }),
  );
}

function poolWith(rounds: number): FineHistogramPool {
  const pool = new FineHistogramPool();
  for (let round = 0; round < rounds; round++) {
    const fine = new Uint32Array(FINE_BINS);
    fine[0] = 1;
    fine[FINE_BINS - 1] = 1;
    pool.record(round, fine, fine);
  }
  return pool;
}

// ─── All measures ────────────────────────────────────────────────────────────

describe("allMeasureSpecs", () => {
  it("lists every catalog measure, in catalog order, with the package's default parameters", () => {
    const specs = allMeasureSpecs(catalog.measures, 5, "public");
    expect(specs.map((item) => item.meta.id)).toEqual(catalog.measures.map((m) => m.id));
    expect(specs.every((item) => item.supported)).toBe(true);
    const byId = Object.fromEntries(specs.map((item) => [item.meta.id, item]));
    expect(byId.EstebanRay?.spec).toEqual({
      measureId: "EstebanRay",
      params: { alpha: 0.8, K: null },
      k: 5,
      belief: "public",
    });
    expect(byId.GeneralizedMEC?.params).toEqual({ alpha: 2, alienation: "d" });
    expect(byId.BiPol?.params).toEqual({});
  });

  it("a measure not defined for k (the catalog's categories) gets no spec, hence no request", () => {
    const at3 = allMeasureSpecs(catalog.measures, 3, "private");
    const unsupported = (specs: typeof at3) =>
      specs.filter((item) => !item.supported).map((item) => item.meta.id);
    // Experts: only k = 5
    expect(unsupported(at3)).toEqual(["Experts"]);
    expect(at3.find((item) => item.meta.id === "Experts")?.spec).toBeNull();
    // Van der Eijk needs k ≥ 3
    expect(unsupported(allMeasureSpecs(catalog.measures, 2, "private"))).toEqual([
      "Experts",
      "VanDerEijkPol",
    ]);
    expect(unsupported(allMeasureSpecs(catalog.measures, 5, "private"))).toEqual([]);
  });

  it("schedules them with negative ids (never a compared series' id), in catalog order", () => {
    const entries = allMeasureEntries(allMeasureSpecs(catalog.measures, 3, "private"));
    expect(entries.map((entry) => entry.id)).toEqual(catalog.measures.map((_, i) => -1 - i));
    expect(entries.find((entry) => entry.id === -4)?.spec).toBeNull(); // Experts at k = 3
  });
});

// ─── Columns ─────────────────────────────────────────────────────────────────

describe("table columns", () => {
  it("series mode: the compared series with their label, colour, spec and series", () => {
    let state = fromSingleSeries({
      measureId: "BiPol",
      paramsByMeasure: {},
      k: 3,
      belief: "private",
    });
    state = addSeries(state);
    state = updateSeries(state, state.selectedId, (s) => ({ ...s, measureId: "Experts" }));
    state = addSeries(state);
    const compared = compareSeries(catalog.measures, state.series, TEXT, PALETTE);
    const spec = compared[0]?.spec;
    if (spec == null) throw new Error("BiPol is defined for k = 3");
    const model = new PolarizationSeries(spec, fakeServer());
    const columns = seriesColumns(compared, [model, null, null]);
    expect(columns.map((column) => column.label)).toEqual([
      "BiPol · k=3 · private",
      "Experts · k=3 · private",
      "Experts · k=3 · private (2)",
    ]);
    expect(columns.map((column) => column.csvLabel)).toEqual([
      "BiPol (k=3, private)",
      "Experts (k=3, private)",
      "Experts (k=3, private) (2)",
    ]);
    expect(columns.map((column) => column.color)).toEqual(["#111", "#222", "#333"]);
    expect(columns.map((column) => column.supported)).toEqual([true, false, false]);
    expect(columns[0]?.series).toBe(model);
    expect(columns.map((column) => column.listIndex)).toEqual([0, 1, 2]);
    // While an edit is debounced the list still has the previous spec's series: not shown
    const previous = new PolarizationSeries({ ...spec, belief: "public" }, fakeServer());
    expect(seriesColumns(compared, [previous, null, null])[0]?.series).toBeNull();
    expect(new Set(columns.map((column) => column.key)).size).toBe(3);
  });

  it("series mode with 10 series: their line styles, and unique labels in the wide CSV", async () => {
    // Every measure overlaid, then nine copies of one series: both are 10 columns
    const all = overlayAllMeasures(
      fromSingleSeries({ measureId: "MEC", paramsByMeasure: {}, k: 5, belief: "private" }),
      catalog.measures,
    ).state;
    const overlaid = seriesColumns(compareSeries(catalog.measures, all.series, TEXT, PALETTE), []);
    expect(overlaid.map((column) => column.dash)).toEqual([
      ...Array(4).fill("solid"),
      ...Array(4).fill("dashed"),
      "dotted",
      "dotted",
    ]);
    expect(overlaid.map((column) => column.color)).toEqual([
      ...PALETTE,
      ...PALETTE,
      "#111",
      "#222",
    ]);

    let copies = fromSingleSeries({
      measureId: "BiPol",
      paramsByMeasure: {},
      k: 5,
      belief: "private",
    });
    for (let i = 1; i < MAX_SERIES; i++) copies = addSeries(copies);
    const compared = compareSeries(catalog.measures, copies.series, TEXT, PALETTE);
    const spec = compared[0]?.spec;
    if (spec == null) throw new Error("BiPol is defined for k = 5");
    const model = new PolarizationSeries(spec, fakeServer());
    await model.sync(poolWith(2), 0);
    // Equal specs share one series (cached: one request for all ten)
    const columns = seriesColumns(compared, Array(MAX_SERIES).fill(model));
    expect(new Set(columns.map((column) => column.csvLabel)).size).toBe(MAX_SERIES);
    expect(new Set(columns.map((column) => column.label)).size).toBe(MAX_SERIES);
    const csv = polarizationCsv("wide", columns, [0, 1], {
      runId: "r",
      networkId: "n",
      fallbackPackage: null,
    });
    const valueHeaders = csv.headers.filter((header) => header.startsWith("BiPol"));
    expect(valueHeaders).toHaveLength(MAX_SERIES);
    expect(new Set(csv.headers).size).toBe(csv.headers.length);
    expect(csv.rows).toHaveLength(2);
  });

  it("all measures: one column per measure, after the compared series in the hook's list", () => {
    const specs = allMeasureSpecs(catalog.measures, 3, "public");
    const models = specs.map((item) =>
      item.spec === null ? null : new PolarizationSeries(item.spec, fakeServer()),
    );
    // Two compared series first, then the measures
    const columns = measureColumns(specs, 3, "public", [null, null, ...models], 2);
    expect(columns.map((column) => column.label)).toEqual(catalog.measures.map((m) => m.name));
    expect(columns.map((column) => column.listIndex)).toEqual(specs.map((_, i) => 2 + i));
    expect(
      columns.every((column) => column.color === null && column.dash === null && column.k === 3),
    ).toBe(true);
    expect(columns.find((column) => column.meta.id === "Experts")).toMatchObject({
      supported: false,
      series: null,
      csvLabel: "Experts (k=3, public)",
    });
    expect(columns.find((column) => column.meta.id === "MECNormalized")?.meta.beta).toBe(true);
    expect(columns[0]?.series).toBe(models[0]);
  });

  it("an export is partial while live, or while a defined column has rounds left to compute", async () => {
    const pool = poolWith(3);
    const specs = allMeasureSpecs(catalog.measures, 3, "private").slice(0, 4); // … Experts
    const models = specs.map((item) =>
      item.spec === null ? null : new PolarizationSeries(item.spec, fakeServer()),
    );
    const columns = measureColumns(specs, 3, "private", models, 0);
    expect(isPartial(columns, 3, false)).toBe(true);
    for (const model of models) await model?.sync(pool, 0);
    // Experts (unsupported) does not hold the export back
    expect(isPartial(columns, 3, false)).toBe(false);
    expect(isPartial(columns, 3, true)).toBe(true);
    expect(isPartial(columns, 4, false)).toBe(true);
    expect(isPartial([], 0, false)).toBe(false);
    // A column without its series yet (no histograms) is not complete either
    expect(isPartial(measureColumns(specs, 3, "private", [], 0), 0, false)).toBe(true);
    expect(tableRounds(columns.map((column) => column.series))).toEqual([0, 1, 2]);
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

describe("view settings", () => {
  beforeEach(() => {
    usePolarizationSettingsStore.setState(defaultSettings());
  });

  it("start on the chart; the table lists the series; all measures follow the selected series", () => {
    const state = usePolarizationSettingsStore.getState();
    expect([state.view, state.tableMode, state.allMeasuresK, state.allMeasuresBelief]).toEqual([
      "chart",
      "series",
      null,
      null,
    ]);
  });

  it("are kept for the session, apart from the series", () => {
    const store = usePolarizationSettingsStore.getState();
    store.setView("table");
    store.setTableMode("all");
    store.setAllMeasuresK(7);
    store.setAllMeasuresBelief("public");
    store.addSeries();
    const state = usePolarizationSettingsStore.getState();
    expect([state.view, state.tableMode, state.allMeasuresK, state.allMeasuresBelief]).toEqual([
      "table",
      "all",
      7,
      "public",
    ]);
    expect(state.series).toHaveLength(2);
  });
});

// ─── One scheduler for the chart's series and the measures ───────────────────

const KEY = "run-1|net-1";

function frame(round: number): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array([0.5, 0.5, 0.5, 0.5]),
    privateBelief: new Float32Array([0, 0, 1, 1]),
    speaking: new Uint8Array(4),
  };
}

describe("usePolarizationSeriesList with the table's measures", () => {
  let frames: FrameRequestCallback[] = [];
  const settle = async () => {
    await act(async () => {
      const pending = frames;
      frames = [];
      for (const cb of pending) cb(0);
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    frames = [];
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.mocked(simulationsApi.computePolarization).mockReset().mockImplementation(fakeServer());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shares the server: one request at a time, a measure equal to a series shares its series, an unsupported one sends nothing", async () => {
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0));
      useRoundAggregatesStore.getState().ingest(KEY, frame(1));
    });
    const chart: SpecEntry[] = [
      { id: 1, spec: { measureId: "BiPol", params: {}, k: 3, belief: "private" } },
    ];
    const measures = allMeasureEntries(allMeasureSpecs(catalog.measures, 3, "private"));
    let inFlight = 0;
    let peak = 0;
    const server = fakeServer();
    vi.mocked(simulationsApi.computePolarization).mockImplementation(async (body) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return server(body);
    });

    const { result, rerender } = renderHook(({ entries }) => usePolarizationSeriesList(entries), {
      initialProps: { entries: chart },
    });
    await settle();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);
    expect(result.current.recorded).toBe(2);

    // The table opens "all measures": its specs join the same list
    rerender({ entries: [...chart, ...measures] });
    for (let i = 0; i < 12; i++) await settle();
    const calls = vi.mocked(simulationsApi.computePolarization).mock.calls.map(([b]) => b.measure);
    // BiPol (default params, k = 3, private) was already computed for the chart; Experts is not
    // defined for k = 3: every other measure once
    expect(calls.filter((measure) => measure === "BiPol")).toHaveLength(1);
    expect(calls).not.toContain("Experts");
    expect(new Set(calls).size).toBe(catalog.measures.length - 1);
    expect(calls).toHaveLength(catalog.measures.length - 1);
    expect(peak).toBe(1);
    const series = result.current.series;
    expect(series).toHaveLength(1 + catalog.measures.length);
    const bipolIndex = 1 + catalog.measures.findIndex((m) => m.id === "BiPol");
    expect(series[bipolIndex]).toBe(series[0]);
    expect(series[1 + catalog.measures.findIndex((m) => m.id === "Experts")]).toBeNull();
    expect(series[1]?.valueAt(1)).toBe(0.5);
  });
});
