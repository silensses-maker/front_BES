import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

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

// The server: pol_measures behind POST /simulations/polarization and GET …/measures.
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
import { usePolarizationCatalogStore } from "./polarization-catalog.store";
import {
  CHUNK_ROUNDS,
  LIVE_INTERVAL_MS,
  PolarizationSeries,
  PolarizationSeriesCache,
  type SeriesSpec,
  seriesCacheFor,
  seriesKey,
} from "./polarization-series";
import {
  defaultSettings,
  effectiveParams,
  selectedMeasure,
  usePolarizationSettingsStore,
} from "./polarization-settings.store";
import { MAX_SERIES, type SeriesConfig } from "./series-list";
import type { SpecEntry } from "./series-scheduler";
import { SPEC_DEBOUNCE_MS, usePolarizationSeriesList } from "./use-polarization-series";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

function measure(id: string) {
  const found = catalog.measures.find((m) => m.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

const KEY = "run-1|net-1";

function frame(round: number, privateBelief: number[]): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(privateBelief.map(() => 0.5)),
    privateBelief: new Float32Array(privateBelief),
    speaking: new Uint8Array(privateBelief.length),
  };
}

/** A pool with `rounds` rounds, round r having r + 1 agents in fine bin 0 (private and public). */
function poolWith(rounds: number, order: number[] = []): FineHistogramPool {
  const pool = new FineHistogramPool();
  const sequence = order.length > 0 ? order : Array.from({ length: rounds }, (_, r) => r);
  for (const round of sequence) {
    const fine = new Uint32Array(FINE_BINS);
    fine[0] = round + 1;
    fine[FINE_BINS - 1] = 1;
    pool.record(round, fine, fine);
  }
  return pool;
}

/** A fake server: value = share of the agents in the first category, level by that value. */
function fakeServer(classification: PolarizationResult["classification"] = null) {
  return vi.fn(
    async (body: PolarizationRequest): Promise<PolarizationResult> => ({
      values: body.histograms.map((h) => {
        const total = h.reduce((a, b) => a + b, 0);
        return total === 0 ? null : (h[0] as number) / total;
      }),
      levels: body.histograms.map(() => (classification === null ? null : "high")),
      errors: body.histograms.map((h) =>
        h.every((c) => c === 0) ? "ValueError: At least one weight must be positive" : null,
      ),
      classification,
      unique: body.histograms.length,
      package: { ref: "0e05564ed0b7b23de368dd19becac3a1de4ef745", version: "0.1.0a2" },
    }),
  );
}

const SPEC: SeriesSpec = { measureId: "BiPol", params: {}, k: 3, belief: "private" };

// ─── Settings ────────────────────────────────────────────────────────────────

describe("usePolarizationSettingsStore", () => {
  beforeEach(() => {
    usePolarizationSettingsStore.setState(defaultSettings());
  });

  const only = () => usePolarizationSettingsStore.getState().series[0] as SeriesConfig;

  it("starts with one series: Esteban–Ray (the package's defaults), k = 5, private beliefs, real values", () => {
    const state = usePolarizationSettingsStore.getState();
    expect(state.series).toHaveLength(1);
    expect([only().measureId, only().k, only().belief, only().slot]).toEqual([
      "EstebanRay",
      5,
      "private",
      0,
    ]);
    expect(state.selectedId).toBe(only().id);
    expect(state.axisMode).toBe("values");
    expect(effectiveParams(measure("EstebanRay"), only().paramsByMeasure)).toEqual({
      alpha: 0.8,
      K: null,
    });
    expect(effectiveParams(measure("GeneralizedMEC"), {})).toEqual({ alpha: 2, alienation: "d" });
    expect(effectiveParams(measure("BiPol"), {})).toEqual({});
  });

  it("remembers parameters per measure, drops unknown names and restores defaults", () => {
    const store = usePolarizationSettingsStore.getState();
    const id = store.selectedId;
    store.setParams(id, "MEC", { alpha: 1 });
    store.setParams(id, "MEC", { beta: 2, gamma: 3 });
    store.setMeasure(id, "BiPol");
    store.setK(id, 7);
    store.setBelief(id, "public");
    expect(effectiveParams(measure("MEC"), only().paramsByMeasure)).toEqual({ alpha: 1, beta: 2 });
    expect([only().measureId, only().k, only().belief]).toEqual(["BiPol", 7, "public"]);
    store.resetParams(id, "MEC");
    expect(only().paramsByMeasure.MEC).toBeUndefined();
    expect(effectiveParams(measure("MEC"), only().paramsByMeasure)).toEqual({
      alpha: 2,
      beta: 1.15,
    });
    store.setParams(id, "EstebanRay", { K: 2 });
    store.setParams(id, "EstebanRay", { K: null });
    expect(effectiveParams(measure("EstebanRay"), only().paramsByMeasure)).toEqual({
      alpha: 0.8,
      K: null,
    });
  });

  it("adds a copy of the selected series, configures each series on its own and removes them", () => {
    const store = usePolarizationSettingsStore.getState();
    store.addSeries();
    let state = usePolarizationSettingsStore.getState();
    const [first, copy] = state.series as [SeriesConfig, SeriesConfig];
    expect(state.selectedId).toBe(copy.id);
    expect([copy.measureId, copy.k, copy.belief]).toEqual(["EstebanRay", 5, "private"]);

    store.setK(copy.id, 3);
    store.setBelief(first.id, "public");
    store.setAxisMode("normalized");
    state = usePolarizationSettingsStore.getState();
    expect(state.series.map((s) => [s.k, s.belief])).toEqual([
      [5, "public"],
      [3, "private"],
    ]);
    expect(state.axisMode).toBe("normalized");

    store.selectSeries(first.id);
    expect(usePolarizationSettingsStore.getState().selectedId).toBe(first.id);
    for (let i = 0; i < 5; i++) store.addSeries();
    expect(usePolarizationSettingsStore.getState().series).toHaveLength(MAX_SERIES);

    for (const series of usePolarizationSettingsStore.getState().series) {
      store.removeSeries(series.id);
    }
    state = usePolarizationSettingsStore.getState();
    expect(state.series).toHaveLength(1); // the last one stays
    expect(state.series[0]?.slot).toBe(0);
    expect(state.selectedId).toBe(state.series[0]?.id);
  });

  it("selects the stored measure, else the default one, else the catalog's first", () => {
    expect(selectedMeasure(catalog.measures, "MEC")?.id).toBe("MEC");
    expect(selectedMeasure(catalog.measures, "Gone")?.id).toBe("EstebanRay");
    expect(selectedMeasure([measure("BiPol")], "Gone")?.id).toBe("BiPol");
    expect(selectedMeasure([], "Gone")).toBeNull();
  });
});

// ─── Catalog ─────────────────────────────────────────────────────────────────

describe("usePolarizationCatalogStore", () => {
  beforeEach(() => {
    usePolarizationCatalogStore.setState({ status: "idle", catalog: null, error: null });
    vi.mocked(simulationsApi.getPolarizationMeasures).mockReset();
  });

  it("loads the server's catalog once per session", async () => {
    vi.mocked(simulationsApi.getPolarizationMeasures).mockResolvedValue(catalog);
    const { load } = usePolarizationCatalogStore.getState();
    await Promise.all([load(), load()]);
    await load();
    expect(usePolarizationCatalogStore.getState().status).toBe("ready");
    expect(usePolarizationCatalogStore.getState().catalog).toBe(catalog);
    expect(simulationsApi.getPolarizationMeasures).toHaveBeenCalledTimes(1);
  });

  it("keeps a failure (404 disabled, 503 unavailable) until load() is called again", async () => {
    vi.mocked(simulationsApi.getPolarizationMeasures).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { error: "unavailable", message: "worker down" } },
    });
    await usePolarizationCatalogStore.getState().load();
    expect(usePolarizationCatalogStore.getState()).toMatchObject({
      status: "error",
      error: { kind: "unavailable", status: 503, message: "worker down" },
    });

    vi.mocked(simulationsApi.getPolarizationMeasures).mockResolvedValueOnce(catalog);
    await usePolarizationCatalogStore.getState().load();
    expect(usePolarizationCatalogStore.getState()).toMatchObject({ status: "ready", error: null });
  });
});

// ─── Series (server-backed) ──────────────────────────────────────────────────

describe("PolarizationSeries", () => {
  it("has a key that ignores parameter order", () => {
    expect(seriesKey({ ...SPEC, params: { alpha: 2, beta: 1.15 } })).toBe(
      seriesKey({ ...SPEC, params: { beta: 1.15, alpha: 2 } }),
    );
    expect(seriesKey({ ...SPEC, params: { K: null } })).not.toBe(seriesKey(SPEC));
    expect(seriesKey({ ...SPEC, belief: "public" })).not.toBe(seriesKey(SPEC));
  });

  it("sends the k-category COUNTS of every recorded round, in arrival order, and stores the answer", async () => {
    const server = fakeServer({
      method: "kmeans",
      paramSet: "default",
      params: {},
      levels: ["low", "medium", "high"],
      thresholds: [0.4525, 0.6267],
    });
    const pool = poolWith(3, [2, 0, 1]);
    const series = new PolarizationSeries(SPEC, server);
    expect(series.nextSyncDelay(pool, 0)).toBe(0);
    await series.sync(pool, 0);

    expect(server).toHaveBeenCalledTimes(1);
    expect(server.mock.calls[0]?.[0]).toEqual({
      measure: "BiPol",
      params: {},
      k: 3,
      histograms: [
        [3, 0, 1],
        [1, 0, 1],
        [2, 0, 1],
      ],
    });
    expect(series.status).toBe("ready");
    expect(series.answered).toBe(3);
    expect(series.valueAt(0)).toBe(0.5);
    expect(series.valueAt(2)).toBe(0.75);
    expect(series.valueAt(9)).toBeNull();
    expect(series.levelAt(1)).toBe("high");
    expect(series.errorAt(1)).toBeNull();
    expect(series.points()).toEqual([
      [0, 0.5],
      [1, 2 / 3],
      [2, 0.75],
    ]);
    expect(series.classification?.thresholds).toEqual([0.4525, 0.6267]);
    expect(series.packageRef).toBe("0e05564ed0b7b23de368dd19becac3a1de4ef745");
    expect(series.nextSyncDelay(pool, 0)).toBeNull();
  });

  it("an empty round is a gap with the package's error, not a failure", async () => {
    const pool = poolWith(1);
    pool.record(1, new Uint32Array(FINE_BINS), new Uint32Array(FINE_BINS));
    const series = new PolarizationSeries(SPEC, fakeServer());
    await series.sync(pool, 0);
    expect(series.status).toBe("ready");
    expect(series.valueAt(1)).toBeNull();
    expect(series.errorAt(1)).toContain("At least one weight must be positive");
    expect(series.points()).toEqual([
      [0, 0.5],
      [1, null],
    ]);
  });

  it("only sends new rounds; once caught up, a live run is throttled to one request per interval", async () => {
    const server = fakeServer();
    const pool = poolWith(2);
    const series = new PolarizationSeries(SPEC, server);
    await series.sync(pool, 1000);
    expect(series.nextSyncDelay(pool, 1000)).toBeNull();

    const fine = new Uint32Array(FINE_BINS);
    fine[100] = 4;
    pool.record(2, fine, fine);
    expect(series.nextSyncDelay(pool, 1500)).toBe(LIVE_INTERVAL_MS - 500);
    expect(series.nextSyncDelay(pool, 1000 + LIVE_INTERVAL_MS + 1)).toBe(0);
    await series.sync(pool, 1000 + LIVE_INTERVAL_MS + 1);
    expect(server.mock.calls[1]?.[0].histograms).toEqual([[0, 4, 0]]);
    expect(series.valueAt(2)).toBe(0);
  });

  it("catches up long runs in chunks of CHUNK_ROUNDS, back to back", async () => {
    const server = fakeServer();
    const pool = poolWith(CHUNK_ROUNDS + 3);
    const series = new PolarizationSeries(SPEC, server);
    await series.sync(pool, 0);
    expect(server.mock.calls[0]?.[0].histograms).toHaveLength(CHUNK_ROUNDS);
    expect(series.nextSyncDelay(pool, 1)).toBe(0); // a full chunk: the rest goes now
    await series.sync(pool, 1);
    expect(server.mock.calls[1]?.[0].histograms).toHaveLength(3);
    expect(series.answered).toBe(CHUNK_ROUNDS + 3);
    expect(series.valueAt(CHUNK_ROUNDS + 2)).toBeCloseTo((CHUNK_ROUNDS + 3) / (CHUNK_ROUNDS + 4));
  });

  it("one request at a time: a second sync returns the request in flight", async () => {
    let release: (value: PolarizationResult) => void = () => {};
    const server = vi.fn(
      () =>
        new Promise<PolarizationResult>((resolve) => {
          release = resolve;
        }),
    );
    const pool = poolWith(1);
    const series = new PolarizationSeries(SPEC, server);
    const first = series.sync(pool, 0);
    expect(series.sync(pool, 0)).toBe(first);
    expect(series.pending).toBe(first);
    expect(series.status).toBe("loading");
    expect(series.nextSyncDelay(pool, 0)).toBeNull();
    release({
      values: [1],
      levels: [null],
      classification: null,
      unique: 1,
      package: { ref: "r", version: "v" },
    });
    await first;
    expect(server).toHaveBeenCalledTimes(1);
    expect(series.pending).toBeNull();
    expect(series.valueAt(0)).toBe(1);
    await expect(series.sync(pool, 0)).resolves.toBeUndefined(); // nothing new
  });

  it("a failed request stops the series until retry() (no fallback), then resumes where it was", async () => {
    const server = vi
      .fn<(body: PolarizationRequest) => Promise<PolarizationResult>>()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503, data: { error: "unavailable", message: "timed out" } },
      })
      .mockImplementation(fakeServer());
    const pool = poolWith(2);
    const series = new PolarizationSeries(SPEC, server);
    await series.sync(pool, 0);
    expect(series.status).toBe("error");
    expect(series.error).toEqual({ kind: "unavailable", status: 503, message: "timed out" });
    expect(series.nextSyncDelay(pool, 0)).toBeNull();
    expect(series.hasValues).toBe(false);

    series.retry();
    expect(series.status).toBe("idle");
    expect(series.nextSyncDelay(pool, 0)).toBe(0);
    await series.sync(pool, 0);
    expect(series.status).toBe("ready");
    expect(server.mock.calls[1]?.[0].histograms).toHaveLength(2);
    series.retry(); // no-op when not failed
    expect(series.status).toBe("ready");
  });

  it("an answer with the wrong number of values is an error", async () => {
    const series = new PolarizationSeries(
      SPEC,
      vi.fn(async () => ({
        values: [],
        levels: [],
        classification: null,
        unique: 0,
        package: { ref: "r", version: "v" },
      })),
    );
    await series.sync(poolWith(2), 0);
    expect(series.status).toBe("error");
    expect(series.error?.kind).toBe("error");
  });
});

describe("PolarizationSeriesCache", () => {
  it("returns the same series for the same spec and evicts the least recently used past 16", () => {
    const cache = new PolarizationSeriesCache(fakeServer());
    const first = cache.get(SPEC);
    expect(cache.get({ ...SPEC, params: {} })).toBe(first);
    for (let i = 0; i < 16; i++) cache.get({ ...SPEC, params: { alpha: i } });
    expect(cache.size).toBe(16);
    expect(cache.get(SPEC)).not.toBe(first);
  });

  it("is one cache per pool (run / network)", () => {
    const pool = new FineHistogramPool();
    expect(seriesCacheFor(pool)).toBe(seriesCacheFor(pool));
    expect(seriesCacheFor(new FineHistogramPool())).not.toBe(seriesCacheFor(pool));
  });
});

// ─── Hook ────────────────────────────────────────────────────────────────────

/** The list hook with one series (what the single-series view uses). */
function useOneSeries(spec: SeriesSpec | null) {
  const state = usePolarizationSeriesList([{ id: 1, spec }]);
  return { ...state, series: state.series[0] ?? null, retry: () => state.retry(0) };
}

describe("usePolarizationSeriesList", () => {
  let frames: FrameRequestCallback[] = [];
  const flushFrames = () => {
    const pending = frames;
    frames = [];
    for (const cb of pending) cb(0);
  };
  const settle = async () => {
    await act(async () => {
      flushFrames();
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
    vi.mocked(simulationsApi.computePolarization).mockReset();
    vi.mocked(simulationsApi.computePolarization).mockImplementation(fakeServer());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requests the recorded rounds from the server, then only the new ones of a live run", async () => {
    const spec: SeriesSpec = { measureId: "BiPol", params: {}, k: 5, belief: "private" };
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 0, 1, 1]));
    });
    const { result } = renderHook(() => useOneSeries(spec));
    await settle();
    const compute = vi.mocked(simulationsApi.computePolarization);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0]?.[0]).toEqual({
      measure: "BiPol",
      params: {},
      k: 5,
      histograms: [[2, 0, 0, 0, 2]],
    });
    expect(result.current.series?.valueAt(0)).toBe(0.5);

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(1, [0, 0.5, 0.5, 0.5]));
      useRoundAggregatesStore.getState().ingest(KEY, frame(2, [0, 0, 0, 1]));
    });
    await settle();
    expect(compute).toHaveBeenCalledTimes(1); // throttled: a live run waits for the interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_INTERVAL_MS);
    });
    expect(compute).toHaveBeenCalledTimes(2);
    expect(compute.mock.calls[1]?.[0].histograms).toEqual([
      [1, 0, 3, 0, 0],
      [3, 0, 0, 0, 1],
    ]);
    expect(result.current.series?.valueAt(2)).toBe(0.75);
    expect(result.current.seriesVersion).toBeGreaterThan(0);
  });

  it("debounces parameter edits and reuses the cached series when going back", async () => {
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0.1, 0.9]));
    });
    const compute = vi.mocked(simulationsApi.computePolarization);
    let spec: SeriesSpec = {
      measureId: "MEC",
      params: { alpha: 2, beta: 1.15 },
      k: 3,
      belief: "private",
    };
    const { result, rerender } = renderHook(() => useOneSeries(spec));
    await settle();
    const first = result.current.series;
    expect(compute).toHaveBeenCalledTimes(1);

    spec = { ...spec, params: { alpha: 1, beta: 1.15 } };
    rerender();
    spec = { ...spec, params: { alpha: 1.5, beta: 1.15 } };
    rerender();
    await settle();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(result.current.series).toBe(first);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPEC_DEBOUNCE_MS);
    });
    await settle();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(compute.mock.calls[1]?.[0].params).toEqual({ alpha: 1.5, beta: 1.15 });

    spec = { measureId: "MEC", params: { beta: 1.15, alpha: 2 }, k: 3, belief: "private" };
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPEC_DEBOUNCE_MS);
    });
    await settle();
    expect(result.current.series).toBe(first);
    expect(compute).toHaveBeenCalledTimes(2); // cached

    act(() => {
      useSimulationStore.getState().updateFrame(frame(0, [0.1, 0.9]));
    });
    await settle();
    expect(result.current.currentRound).toBe(0);
  });

  it("new rounds during a request in flight wait for it, then follow (no stall, no parallel request)", async () => {
    let release: () => void = () => {};
    const compute = vi.mocked(simulationsApi.computePolarization);
    const server = fakeServer();
    compute.mockImplementationOnce(
      (body) =>
        new Promise((resolve) => {
          release = () => resolve(server(body));
        }),
    );
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 1]));
    });
    const spec: SeriesSpec = { measureId: "BiPol", params: {}, k: 3, belief: "private" };
    const { result } = renderHook(() => useOneSeries(spec));
    await settle();
    expect(result.current.series?.status).toBe("loading");

    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(1, [0, 0]));
    });
    await settle(); // the effect re-runs while the first request is still in flight
    expect(compute).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(LIVE_INTERVAL_MS);
    });
    await settle();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(compute.mock.calls[1]?.[0].histograms).toEqual([[2, 0, 0]]);
    expect(result.current.series?.valueAt(1)).toBe(1);
    expect(result.current.series?.status).toBe("ready");
  });

  it("no spec (catalog not loaded, unsupported k): no series and no request", async () => {
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0.2]));
    });
    const { result } = renderHook(() => useOneSeries(null));
    await settle();
    expect(result.current.series).toBeNull();
    expect(simulationsApi.computePolarization).not.toHaveBeenCalled();
    act(() => result.current.retry());
  });

  it("retry() requests again after a failure", async () => {
    vi.mocked(simulationsApi.computePolarization).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { error: "unavailable", message: "down" } },
    });
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 1]));
    });
    const spec: SeriesSpec = { measureId: "EMDPol", params: {}, k: 3, belief: "public" };
    const { result } = renderHook(() => useOneSeries(spec));
    await settle();
    expect(result.current.series?.status).toBe("error");
    expect(result.current.series?.error?.kind).toBe("unavailable");

    act(() => result.current.retry());
    await settle();
    expect(result.current.series?.status).toBe("ready");
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2);
  });

  it("compared series share the server: one request at a time, round-robin between them", async () => {
    const compute = vi.mocked(simulationsApi.computePolarization);
    const server = fakeServer();
    const releases: Array<() => void> = [];
    compute.mockImplementation(
      (body) =>
        new Promise((resolve) => {
          releases.push(() => resolve(server(body)));
        }),
    );
    const release = async () => {
      await act(async () => {
        releases.shift()?.();
        await vi.advanceTimersByTimeAsync(0);
      });
      await settle();
    };
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 1]));
    });
    const a: SeriesSpec = { measureId: "BiPol", params: {}, k: 3, belief: "private" };
    const b: SeriesSpec = { measureId: "EMDPol", params: {}, k: 5, belief: "public" };
    const { result } = renderHook(() =>
      usePolarizationSeriesList([
        { id: 1, spec: a },
        { id: 2, spec: b },
      ]),
    );
    await settle();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0]?.[0].measure).toBe("BiPol");
    await release();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(compute.mock.calls[1]?.[0].measure).toBe("EMDPol");
    await release();
    expect(result.current.series.map((series) => series?.status)).toEqual(["ready", "ready"]);

    // A live run: both have a new round; once the interval is over, the one served longest ago
    // goes first, then the other (never two requests at once)
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(1, [0, 0]));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_INTERVAL_MS);
    });
    await settle();
    expect(compute).toHaveBeenCalledTimes(3);
    expect(compute.mock.calls[2]?.[0]).toMatchObject({ measure: "BiPol", histograms: [[2, 0, 0]] });
    await release();
    expect(compute).toHaveBeenCalledTimes(4);
    expect(compute.mock.calls[3]?.[0].measure).toBe("EMDPol");
    await release();
    expect(result.current.series[0]?.valueAt(1)).toBe(1);
    expect(result.current.series[1]?.answered).toBe(2);
  });

  it("a failing series stops on its own: the others go on, and retry() only asks for it", async () => {
    const compute = vi.mocked(simulationsApi.computePolarization);
    const server = fakeServer();
    compute.mockImplementation((body) =>
      body.measure === "MEC"
        ? Promise.reject({
            isAxiosError: true,
            response: { status: 503, data: { error: "unavailable", message: "busy" } },
          })
        : server(body),
    );
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0, 1]));
    });
    const mec: SeriesSpec = {
      measureId: "MEC",
      params: { alpha: 2, beta: 1.15 },
      k: 3,
      belief: "private",
    };
    const bipol: SeriesSpec = { measureId: "BiPol", params: {}, k: 3, belief: "private" };
    const { result } = renderHook(() =>
      usePolarizationSeriesList([
        { id: 1, spec: mec },
        { id: 2, spec: bipol },
      ]),
    );
    await settle();
    await settle();
    expect(result.current.series[0]?.status).toBe("error");
    expect(result.current.series[0]?.error?.message).toBe("busy");
    expect(result.current.series[1]?.status).toBe("ready");
    expect(result.current.series[1]?.valueAt(0)).toBe(0.5);
    expect(compute).toHaveBeenCalledTimes(2);

    compute.mockImplementation(server);
    act(() => result.current.retry(0));
    await settle();
    expect(result.current.series[0]?.status).toBe("ready");
    expect(compute).toHaveBeenCalledTimes(3);
    expect(compute.mock.calls[2]?.[0].measure).toBe("MEC");
    act(() => result.current.retry(5)); // no series there: nothing to clear
  });

  it("debounces each series on its own; a copy shares the cached series; removing applies at once", async () => {
    const compute = vi.mocked(simulationsApi.computePolarization);
    act(() => {
      useRoundAggregatesStore.getState().ingest(KEY, frame(0, [0.1, 0.9]));
    });
    const a: SeriesSpec = { measureId: "BiPol", params: {}, k: 3, belief: "private" };
    let entries: SpecEntry[] = [{ id: 1, spec: a }];
    const { result, rerender } = renderHook(() => usePolarizationSeriesList(entries));
    await settle();
    expect(compute).toHaveBeenCalledTimes(1);

    // A copy (new id, same spec): at once, the same cached series, no request
    entries = [
      { id: 1, spec: a },
      { id: 2, spec: a },
    ];
    rerender();
    await settle();
    expect(result.current.series[1]).toBe(result.current.series[0]);
    expect(compute).toHaveBeenCalledTimes(1);

    // Editing the copy waits for the debounce; the first series is not touched
    const b: SeriesSpec = { ...a, k: 5 };
    entries = [
      { id: 1, spec: a },
      { id: 2, spec: b },
    ];
    rerender();
    await settle();
    expect(result.current.series[1]?.spec.k).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPEC_DEBOUNCE_MS);
    });
    await settle();
    expect(result.current.series[1]?.spec.k).toBe(5);
    expect(result.current.series[0]?.spec.k).toBe(3);
    expect(compute).toHaveBeenCalledTimes(2);

    entries = [{ id: 2, spec: b }];
    rerender();
    expect(result.current.series).toHaveLength(1);
    expect(result.current.series[0]?.spec.k).toBe(5);
  });
});

describe("round-aggregates store (polarization hook)", () => {
  beforeEach(() => useRoundAggregatesStore.getState().reset());

  it("records the fine histograms of every ingested round and resets them per key", () => {
    useRoundAggregatesStore.getState().ingest(KEY, frame(3, [0, 0.5, 1]));
    const pool = useRoundAggregatesStore.getState().fineHistograms;
    expect(pool?.has(3)).toBe(true);
    expect(pool?.fine(3, "private")?.[105]).toBe(1);
    expect(pool?.fine(3, "public")?.[105]).toBe(3);

    useRoundAggregatesStore.getState().ingest("run-2|net-1", frame(0, [0.2]));
    const next = useRoundAggregatesStore.getState().fineHistograms;
    expect(next).not.toBe(pool);
    expect(next?.has(3)).toBe(false);
    expect(useRoundAggregatesStore.getState().aggregates[0]?.variancePrivate).toBe(0);
  });
});
