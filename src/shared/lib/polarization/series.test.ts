import { describe, expect, it } from "vitest";
import { FINE_BINS } from "./binning";
import { createMeasure } from "./factory";
import { FineHistogramPool } from "./fine-histograms";
import { PolarizationSeries, PolarizationSeriesCache, seriesCacheFor, seriesKey } from "./series";

function fine(entries: Record<number, number>): Uint32Array {
  const out = new Uint32Array(FINE_BINS);
  for (const [bin, count] of Object.entries(entries)) out[Number(bin)] = count;
  return out;
}

/** Round r: public = two poles, private = consensus drifting with r. */
function poolWithRounds(rounds: number[]): FineHistogramPool {
  const pool = new FineHistogramPool();
  for (const r of rounds)
    pool.record(r, fine({ 0: 5, 209: 5 }), fine({ [r % FINE_BINS]: 7, 100: 3 }));
  return pool;
}

describe("PolarizationSeries", () => {
  it("computes the measure per round from the k-category histogram", () => {
    const pool = poolWithRounds([0, 1, 2]);
    const series = new PolarizationSeries({
      measureId: "EstebanRay",
      params: {},
      k: 5,
      belief: "public",
    });
    expect(series.update(pool)).toEqual({ done: true, changed: true });
    const expected = createMeasure("EstebanRay").call([0, 0.25, 0.5, 0.75, 1], [0.5, 0, 0, 0, 0.5]);
    expect(series.valueAt(0)).toBe(expected);
    expect(series.valueAt(2)).toBe(expected);
    expect(series.maxRound).toBe(2);
    expect(series.version).toBe(1);
    // Nothing new: no change, same version
    expect(series.update(pool)).toEqual({ done: true, changed: false });
    expect(series.version).toBe(1);
  });

  it("uses the selected belief type and k", () => {
    const pool = poolWithRounds([0]);
    const privateSeries = new PolarizationSeries({
      measureId: "BiPol",
      params: {},
      k: 3,
      belief: "private",
    });
    privateSeries.update(pool);
    const expected = createMeasure("BiPol").call([0, 0.5, 1], [0.7, 0.3, 0]);
    expect(privateSeries.valueAt(0)).toBe(expected);
  });

  it("processes only rounds recorded since the last update, in any order", () => {
    const pool = poolWithRounds([4]);
    const series = new PolarizationSeries({
      measureId: "MEC",
      params: {},
      k: 5,
      belief: "private",
    });
    series.update(pool);
    pool.record(1, fine({ 0: 1 }), fine({ 0: 1 }));
    expect(series.update(pool).changed).toBe(true);
    expect(series.valueAt(1)).not.toBeNull();
    expect(series.points().map(([round]) => round)).toEqual([1, 4]);
    expect(series.points(2).map(([round]) => round)).toEqual([1]);
  });

  it("stops at the time budget and resumes on the next call", () => {
    const pool = poolWithRounds(Array.from({ length: 64 }, (_, i) => i));
    const series = new PolarizationSeries({
      measureId: "MEC",
      params: {},
      k: 7,
      belief: "private",
    });
    let clock = 0;
    const now = () => {
      clock += 5;
      return clock;
    };
    const first = series.update(pool, 8, now);
    expect(first.done).toBe(false);
    expect(series.maxRound).toBeLessThan(63);
    let guard = 0;
    while (!series.update(pool, 8, now).done && guard++ < 100) {
      // keep going
    }
    expect(series.maxRound).toBe(63);
  });

  it("marks rounds whose histogram is empty as errors (gaps)", () => {
    const pool = new FineHistogramPool();
    pool.record(0, new Uint32Array(FINE_BINS), new Uint32Array(FINE_BINS));
    pool.record(1, fine({ 0: 1 }), fine({ 0: 1 }));
    const series = new PolarizationSeries({
      measureId: "EMDPol",
      params: {},
      k: 5,
      belief: "public",
    });
    series.update(pool);
    expect(series.valueAt(0)).toBeNull();
    expect(series.lastError).toBe("At least one weight must be positive");
    expect(series.points()).toEqual([
      [0, null],
      [1, 0],
    ]);
    expect(series.valueAt(-1)).toBeNull();
    expect(series.valueAt(500)).toBeNull();
  });

  it("reports measures that do not support k or reject their parameters", () => {
    const pool = poolWithRounds([0]);
    const experts = new PolarizationSeries({
      measureId: "Experts",
      params: {},
      k: 3,
      belief: "private",
    });
    expect(experts.unavailable).toBe("unsupported-categories");
    expect(experts.update(pool)).toEqual({ done: true, changed: false });
    expect(experts.points()).toEqual([]);

    const er = new PolarizationSeries({
      measureId: "EstebanRay",
      params: { alpha: 2 },
      k: 5,
      belief: "private",
    });
    expect(er.unavailable).toBe("alpha must be in (0, 1.6]");
    expect(er.classifier).toBeNull();
  });

  it("exposes the package classifier when thresholds apply", () => {
    const er = new PolarizationSeries({
      measureId: "EstebanRay",
      params: {},
      k: 5,
      belief: "private",
    });
    expect(er.classifier?.thresholds).toEqual([0.3791, 0.5141]);
    const custom = new PolarizationSeries({
      measureId: "EstebanRay",
      params: { alpha: 1 },
      k: 5,
      belief: "private",
    });
    expect(custom.classifier).toBeNull();
  });

  it("grows its per-round buffers for long runs", () => {
    const pool = poolWithRounds([3, 500]);
    const series = new PolarizationSeries({
      measureId: "ShannonPol",
      params: {},
      k: 10,
      belief: "public",
    });
    series.update(pool);
    expect(series.maxRound).toBe(500);
    expect(series.valueAt(500)).toBe(series.valueAt(3));
    expect(series.points()).toHaveLength(2);
  });

  it("keys a series by measure, parameters, k and belief", () => {
    const key = seriesKey({
      measureId: "MEC",
      params: { alpha: 2, beta: 1.15 },
      k: 5,
      belief: "private",
    });
    expect(key).toBe("MEC|alpha=2|beta=1.15|k=5|private");
    expect(
      seriesKey({
        measureId: "EstebanRay",
        params: { alpha: 0.8, K: null },
        k: 3,
        belief: "public",
      }),
    ).toBe("EstebanRay|alpha=0.8|K=auto|k=3|public");
  });
});

describe("PolarizationSeriesCache", () => {
  it("memoizes per key and evicts the least recently used beyond 16", () => {
    const cache = new PolarizationSeriesCache();
    const spec = { measureId: "BiPol" as const, params: {}, k: 5, belief: "private" as const };
    const first = cache.get(spec);
    expect(cache.get({ ...spec })).toBe(first);
    for (let i = 0; i < 16; i++) {
      cache.get({ measureId: "MEC", params: { alpha: 1 + i }, k: 5, belief: "private" });
    }
    expect(cache.size).toBe(16);
    expect(cache.get(spec)).not.toBe(first);
  });

  it("keeps one cache per pool", () => {
    const a = new FineHistogramPool();
    const b = new FineHistogramPool();
    expect(seriesCacheFor(a)).toBe(seriesCacheFor(a));
    expect(seriesCacheFor(a)).not.toBe(seriesCacheFor(b));
  });
});
