import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The series model's default compute calls the server; nothing here sends a request.
vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { computePolarization: vi.fn(), getPolarizationMeasures: vi.fn() },
}));

import type { PolarizationCatalog } from "@/shared/api/backend";
import { FINE_BINS, FineHistogramPool } from "@/shared/lib/polarization";
import type { SeriesLabelText } from "../lib/series-label";
import { compareSeries, problemOf, sharedSettings } from "./compared-series";
import { PolarizationSeries, type SeriesSpec } from "./polarization-series";
import {
  addSeries,
  fromSingleSeries,
  MAX_SERIES,
  overlayAllMeasures,
  removeSeries,
  restoreList,
  type SeriesConfig,
  type SeriesListState,
  selectedSeries,
  selectSeries,
  updateSeries,
  withoutParams,
  withParams,
} from "./series-list";
import { debounceEntries, entriesKey, nextToSync, type SpecEntry } from "./series-scheduler";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

const ONE = fromSingleSeries({
  measureId: "MEC",
  paramsByMeasure: { MEC: { alpha: 1 } },
  k: 5,
  belief: "private",
});

/** A list with `n` series (each added from the previously selected one). */
function listOf(n: number): SeriesListState {
  let state = ONE;
  for (let i = 1; i < n; i++) state = addSeries(state);
  return state;
}

const ids = (state: SeriesListState) => state.series.map((s) => s.id);
const slots = (state: SeriesListState) => state.series.map((s) => s.slot);

// ─── Series list ─────────────────────────────────────────────────────────────

describe("series list", () => {
  it("migrates the single-series settings to a one-series list (slot 0, selected)", () => {
    expect(ONE).toEqual({
      series: [
        {
          id: 1,
          slot: 0,
          measureId: "MEC",
          paramsByMeasure: { MEC: { alpha: 1 } },
          k: 5,
          belief: "private",
        },
      ],
      selectedId: 1,
      nextId: 2,
    });
    expect(selectedSeries(ONE).id).toBe(1);
    expect(selectedSeries({ ...ONE, selectedId: 99 }).id).toBe(1);
  });

  it("+ clones the selected series right after it, with the first free colour, and selects it", () => {
    const two = addSeries(ONE);
    expect(ids(two)).toEqual([1, 2]);
    expect(two.selectedId).toBe(2);
    expect(two.nextId).toBe(3);
    const [source, copy] = two.series as [SeriesConfig, SeriesConfig];
    expect({ ...copy, id: source.id, slot: source.slot }).toEqual(source);
    expect(copy.slot).toBe(1);
    // The copy's parameters are its own
    const edited = updateSeries(two, 2, (s) => withParams(s, "MEC", { beta: 2 }));
    expect(edited.series[0]?.paramsByMeasure.MEC).toEqual({ alpha: 1 });
    expect(edited.series[1]?.paramsByMeasure.MEC).toEqual({ alpha: 1, beta: 2 });

    // Cloning the first of two inserts between them
    const three = addSeries(selectSeries(two, 1));
    expect(ids(three)).toEqual([1, 3, 2]);
    expect(slots(three)).toEqual([0, 2, 1]);
  });

  it("caps the list at MAX_SERIES = 10, one per measure of the package (+ is a no-op)", () => {
    expect(MAX_SERIES).toBe(10);
    expect(MAX_SERIES).toBe(catalog.measures.length);
    const full = listOf(MAX_SERIES);
    expect(full.series).toHaveLength(10);
    expect([...slots(full)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(addSeries(full)).toBe(full);
  });

  it("keeps every other series' slot (colour and line style) when one is removed", () => {
    const full = listOf(MAX_SERIES);
    const slotOf = (state: SeriesListState) =>
      new Map(state.series.map((series) => [series.id, series.slot]));
    const before = slotOf(full);
    for (const removed of [full.series[0], full.series[4], full.series[9]]) {
      const after = removeSeries(full, (removed as SeriesConfig).id);
      expect(after.series).toHaveLength(9);
      for (const [id, slot] of slotOf(after)) expect(slot).toBe(before.get(id));
    }
    // The freed slot is the one a new series takes
    const dashed = full.series.find((series) => series.slot === 5) as SeriesConfig;
    expect(addSeries(removeSeries(full, dashed.id)).series.map((s) => s.slot)).toContain(5);
    // Down to one: it takes slot 0 (the single-series style)
    let state = full;
    for (const series of full.series.slice(1)) state = removeSeries(state, series.id);
    expect(slots(state)).toEqual([0]);
  });

  it("× removes a series, never the last one; the selection moves to a neighbour", () => {
    const three = listOf(3); // ids 1, 2, 3; 3 selected
    expect(removeSeries(ONE, 1)).toBe(ONE);
    expect(removeSeries(three, 42)).toBe(three);

    const withoutLast = removeSeries(three, 3);
    expect(ids(withoutLast)).toEqual([1, 2]);
    expect(withoutLast.selectedId).toBe(2); // previous one (it was the last)

    const withoutMiddle = removeSeries(selectSeries(three, 2), 2);
    expect(ids(withoutMiddle)).toEqual([1, 3]);
    expect(withoutMiddle.selectedId).toBe(3); // the next one

    const keepSelection = removeSeries(three, 1);
    expect(keepSelection.selectedId).toBe(3);
    expect(slots(keepSelection)).toEqual([1, 2]); // the others keep their colours
  });

  it("a series left alone takes the single-series colour; freed colours are reused", () => {
    const two = listOf(2);
    const alone = removeSeries(two, 1);
    expect(alone.series).toEqual([expect.objectContaining({ id: 2, slot: 0 })]);
    const three = listOf(3);
    const reused = addSeries(removeSeries(three, 2));
    expect(slots(reused)).toEqual([0, 2, 1]);
  });

  it("selects and updates only known series", () => {
    const two = listOf(2);
    expect(selectSeries(two, 2)).toBe(two);
    expect(selectSeries(two, 9)).toBe(two);
    expect(selectSeries(two, 1).selectedId).toBe(1);
    expect(updateSeries(two, 9, (s) => ({ ...s, k: 3 }))).toBe(two);
    const updated = updateSeries(two, 1, (s) => ({ ...s, k: 3 }));
    expect(updated.series.map((s) => s.k)).toEqual([3, 5]);
  });

  it("edits and restores a series' parameters per measure", () => {
    const [series] = ONE.series as [SeriesConfig];
    const edited = withParams(withParams(series, "EstebanRay", { alpha: 1.2 }), "EstebanRay", {
      K: 2,
    });
    expect(edited.paramsByMeasure).toEqual({ MEC: { alpha: 1 }, EstebanRay: { alpha: 1.2, K: 2 } });
    expect(withoutParams(edited, "EstebanRay").paramsByMeasure).toEqual({ MEC: { alpha: 1 } });
  });
});

// ─── Overlay all measures ───────────────────────────────────────────────────

describe("overlayAllMeasures", () => {
  const order = catalog.measures.map((m) => m.id);
  /** A configured list: MEC with an edited α and a copy reading the public beliefs, k = `k`. */
  function configured(k: 3 | 5 | 7 | 10): SeriesListState {
    let state = updateSeries(ONE, 1, (s) => ({ ...s, k }));
    state = addSeries(state);
    return updateSeries(state, state.selectedId, (s) => ({ ...s, belief: "public" }));
  }

  it("k = 5: every measure, in catalog order, with defaults and the selected series' k and belief", () => {
    const before = configured(5);
    const plan = overlayAllMeasures(before, catalog.measures);
    expect(plan.skipped).toEqual([]);
    expect(plan.omitted).toEqual([]);
    expect(plan.state.series.map((s) => s.measureId)).toEqual(order);
    expect(slots(plan.state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.state.series.every((s) => s.k === 5 && s.belief === "public")).toBe(true);
    expect(plan.state.series.every((s) => Object.keys(s.paramsByMeasure).length === 0)).toBe(true);
    // New ids (never reused), and the selected series' measure stays selected
    expect(ids(plan.state)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plan.state.nextId).toBe(13);
    expect(selectedSeries(plan.state).measureId).toBe("MEC");
  });

  it("skips the measures not defined for k (Experts: only k = 5), keeping the order", () => {
    for (const k of [3, 7, 10] as const) {
      const plan = overlayAllMeasures(configured(k), catalog.measures);
      expect(plan.skipped).toEqual(["Experts"]);
      expect(plan.state.series.map((s) => s.measureId)).toEqual(
        order.filter((id) => id !== "Experts"),
      );
      expect(slots(plan.state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(plan.state.series.every((s) => s.k === k)).toBe(true);
    }
  });

  it("caps at MAX_SERIES (the rest is reported as omitted)", () => {
    const more = [
      ...catalog.measures,
      { id: "Extra1", categories: [5] },
      { id: "Extra2", categories: [3, 5] },
    ];
    const plan = overlayAllMeasures(ONE, more);
    expect(plan.state.series).toHaveLength(MAX_SERIES);
    expect(plan.omitted).toEqual(["Extra1", "Extra2"]);
    expect(plan.state.series.map((s) => s.measureId)).toEqual(order);
  });

  it("one measure defined: slot 0; none: the list unchanged", () => {
    const only = overlayAllMeasures(ONE, [
      { id: "BiPol", categories: [5] },
      { id: "Experts", categories: [3] },
    ]);
    expect(only.state.series).toEqual([expect.objectContaining({ measureId: "BiPol", slot: 0 })]);
    expect(only.state.selectedId).toBe(only.state.series[0]?.id);
    expect(only.skipped).toEqual(["Experts"]);
    const none = overlayAllMeasures(ONE, [{ id: "Experts", categories: [3] }]);
    expect(none.state).toBe(ONE);
    expect(none.skipped).toEqual(["Experts"]);
  });

  it("undo puts the replaced list back; ids are still never reused", () => {
    const before = configured(5);
    const overlaid = overlayAllMeasures(before, catalog.measures).state;
    const undone = restoreList(overlaid, before);
    expect(undone.series).toBe(before.series);
    expect(undone.selectedId).toBe(before.selectedId);
    expect(undone.nextId).toBe(overlaid.nextId);
    expect(ids(addSeries(undone))).toContain(overlaid.nextId);
    // Restoring a list with a higher next id keeps it
    expect(restoreList(ONE, overlaid).nextId).toBe(overlaid.nextId);
  });
});

// ─── Scheduling ──────────────────────────────────────────────────────────────

describe("nextToSync (fair scheduling)", () => {
  const due = (key: string, delay: number | null) => ({ key, delay });

  it("serves the due series round-robin, starting after the last one served", () => {
    const all = [due("a", 0), due("b", 0), due("c", 0)];
    expect(nextToSync(all, null)).toEqual({ index: 0, delay: 0 });
    expect(nextToSync(all, "a")).toEqual({ index: 1, delay: 0 });
    expect(nextToSync(all, "c")).toEqual({ index: 0, delay: 0 });
    expect(nextToSync(all, "gone")).toEqual({ index: 0, delay: 0 });
    expect(nextToSync([due("a", 0), due("b", null), due("c", 0)], "a")).toEqual({
      index: 2,
      delay: 0,
    });
    // The one served last goes again when it is the only one due
    expect(nextToSync([due("a", 0), due("b", 500)], "a")).toEqual({ index: 0, delay: 0 });
  });

  it("waits for the soonest one when none is due, and for nothing when none waits", () => {
    expect(nextToSync([due("a", 800), due("b", 300), due("c", null)], null)).toEqual({
      index: 1,
      delay: 300,
    });
    expect(nextToSync([due("a", null), due("b", null)], "a")).toBeNull();
    expect(nextToSync([], null)).toBeNull();
  });
});

describe("debounceEntries (per series)", () => {
  const spec = (measureId: string, k = 5): SeriesSpec => ({
    measureId,
    params: {},
    k,
    belief: "private",
  });
  const entry = (id: number, value: SeriesSpec | null): SpecEntry => ({ id, spec: value });

  it("keeps a changed spec until the debounce ends; the others follow at once", () => {
    const applied = [entry(1, spec("MEC")), entry(2, spec("BiPol"))];
    const current = [entry(1, spec("MEC", 7)), entry(2, spec("BiPol"))];
    expect(debounceEntries(applied, current)).toEqual({
      entries: [entry(1, spec("MEC")), entry(2, spec("BiPol"))],
      pending: true,
    });
    expect(debounceEntries(applied, applied)).toEqual({ entries: applied, pending: false });
  });

  it("applies new and removed series, and specs appearing or going away, at once", () => {
    const applied = [entry(1, spec("MEC")), entry(2, spec("Experts"))];
    const current = [entry(2, null), entry(3, spec("MEC"))];
    expect(debounceEntries(applied, current)).toEqual({ entries: current, pending: false });
    expect(debounceEntries([entry(1, null)], [entry(1, spec("MEC"))])).toEqual({
      entries: [entry(1, spec("MEC"))],
      pending: false,
    });
  });

  it("identifies a list by its ids and spec keys", () => {
    const list = [entry(1, spec("MEC")), entry(2, null)];
    expect(entriesKey(list)).toBe("1:MEC|k=5|private\n2:-");
    expect(entriesKey([entry(1, { ...spec("MEC"), params: {} })])).toBe(
      entriesKey([entry(1, spec("MEC"))]),
    );
  });
});

// ─── Resolution against the catalog ──────────────────────────────────────────

describe("compareSeries", () => {
  const text: SeriesLabelText = {
    lang: "en",
    belief: (belief) => belief,
    auto: "auto",
    alienations: catalog.alienations,
  };
  const palette = ["c0", "c1", "c2", "c3"];

  it("resolves each series' measure, effective parameters, spec, unique label and colour", () => {
    const two = addSeries(ONE);
    const [first, copy] = compareSeries(catalog.measures, two.series, text, palette);
    expect(first?.meta.id).toBe("MEC");
    expect(first?.params).toEqual({ alpha: 1, beta: 1.15 });
    expect(first?.spec).toEqual({
      measureId: "MEC",
      params: { alpha: 1, beta: 1.15 },
      k: 5,
      belief: "private",
    });
    expect(first?.label).toBe("MEC · k=5 · private · α=1");
    expect(copy?.label).toBe("MEC · k=5 · private · α=1 (2)");
    expect([first?.color, copy?.color]).toEqual(["c0", "c1"]);
    expect([first?.dash, copy?.dash]).toEqual(["solid", "solid"]);
  });

  it("colours and line styles follow the slots (4 colours × solid / dashed / dotted)", () => {
    const all = overlayAllMeasures(ONE, catalog.measures).state;
    const items = compareSeries(catalog.measures, all.series, text, palette);
    expect(items.map((item) => `${item.color}:${item.dash}`)).toEqual([
      "c0:solid",
      "c1:solid",
      "c2:solid",
      "c3:solid",
      "c0:dashed",
      "c1:dashed",
      "c2:dashed",
      "c3:dashed",
      "c0:dotted",
      "c1:dotted",
    ]);
  });

  it("short labels leave out the k and belief every series shares (shown once instead)", () => {
    const all = overlayAllMeasures(ONE, catalog.measures).state;
    const items = compareSeries(catalog.measures, all.series, text, palette);
    expect(items.map((item) => item.shortLabel)).toEqual(catalog.measures.map((m) => m.name));
    expect(items[0]?.label).toBe("Esteban–Ray · k=5 · private");
    expect(sharedSettings(all.series, text)).toBe("k=5 · private");

    // Copies stay unique; edited parameters stay in the short label
    const two = addSeries(ONE);
    const copies = compareSeries(catalog.measures, two.series, text, palette);
    expect(copies.map((item) => item.shortLabel)).toEqual(["MEC · α=1", "MEC · α=1 (2)"]);

    // Different k or belief: the full labels, nothing shared
    const mixed = updateSeries(two, 2, (s) => ({ ...s, belief: "public" }));
    const items2 = compareSeries(catalog.measures, mixed.series, text, palette);
    expect(items2.map((item) => item.shortLabel)).toEqual(items2.map((item) => item.label));
    expect(sharedSettings(mixed.series, text)).toBeNull();
    expect(sharedSettings([], text)).toBeNull();
  });

  it("a measure not defined for the series' k has no spec and offers its k (Experts: 5)", () => {
    const experts = updateSeries(ONE, 1, (s) => ({ ...s, measureId: "Experts", k: 3 }));
    const [item] = compareSeries(catalog.measures, experts.series, text, palette);
    expect(item?.supported).toBe(false);
    expect(item?.spec).toBeNull();
    expect(item?.firstSupportedK).toBe(5);
  });

  it("falls back like the single-series view for an unknown measure, and to no colour", () => {
    const gone = updateSeries(ONE, 1, (s) => ({ ...s, measureId: "Gone" }));
    const [item] = compareSeries(catalog.measures, gone.series, text, []);
    expect(item?.meta.id).toBe("EstebanRay");
    expect(item?.color).toBe("");
    const none = compareSeries(
      catalog.measures.map((m) => ({ ...m, categories: [] })),
      ONE.series,
      text,
      palette,
    );
    expect(none[0]?.firstSupportedK).toBeNull();
  });
});

describe("problemOf", () => {
  const text: SeriesLabelText = {
    lang: "en",
    belief: (belief) => belief,
    auto: "auto",
    alienations: catalog.alienations,
  };
  const [item] = compareSeries(catalog.measures, ONE.series, text, ["c0"]);
  /** A series whose server answers `status` with `message`. */
  const failed = (status: number, message: string) =>
    new PolarizationSeries(item?.spec as SeriesSpec, () =>
      Promise.reject({ isAxiosError: true, response: { status, data: { error: "x", message } } }),
    );

  it("an unsupported k, rejected parameters and a failed request; none otherwise", async () => {
    const ok = item as NonNullable<typeof item>;
    expect(problemOf({ ...ok, supported: false }, null)).toEqual({ kind: "unsupported" });
    expect(problemOf(ok, null)).toBeNull();
    expect(problemOf(ok, new PolarizationSeries(ok.spec as SeriesSpec))).toBeNull();

    const pool = new FineHistogramPool();
    pool.record(0, new Uint32Array(FINE_BINS).fill(1), new Uint32Array(FINE_BINS).fill(1));
    const invalid = failed(422, "bad alpha");
    await invalid.sync(pool, 0);
    expect(problemOf(ok, invalid)).toEqual({ kind: "invalid", message: "bad alpha" });
    const down = failed(503, "busy");
    await down.sync(pool, 0);
    expect(problemOf(ok, down)).toEqual({
      kind: "error",
      error: { kind: "unavailable", status: 503, message: "busy" },
    });
  });
});
