/**
 * Polarization replica (#129) — per-round measure series, computed on demand from the stored fine
 * histograms and memoized per (measure, params, k, belief).
 *
 * A series processes the pool's arrival log incrementally (only rounds recorded since its last
 * update) under a time budget, so a long run never blocks a frame: the caller re-schedules
 * `update` while it reports `done: false`. One cache exists per FineHistogramPool (a new run or
 * network gets a new pool, so stale series are dropped with it).
 */

import type { PolarizationMeasure } from "./base";
import { categoryPositions } from "./binning";
import { type Classifier, uiClassifier } from "./classification";
import { isPolarizationError } from "./errors";
import { createMeasure } from "./factory";
import type { BeliefKind, FineHistogramPool } from "./fine-histograms";
import { type MeasureId, type MeasureParams, paramsKey, supportsCategories } from "./registry";

export interface SeriesSpec {
  measureId: MeasureId;
  params: MeasureParams;
  k: number;
  belief: BeliefKind;
}

/** Per-round state: not computed yet, a value (possibly NaN), or an error. */
const PENDING = 0;
const VALUE = 1;
const ERROR = 2;

export function seriesKey({ measureId, params, k, belief }: SeriesSpec): string {
  return `${paramsKey(measureId, params)}|k=${k}|${belief}`;
}

export class PolarizationSeries {
  readonly spec: SeriesSpec;
  /** Set when the measure cannot be built or does not support k (no values at all). */
  readonly unavailable: string | null;
  /** Level classifier (package thresholds), null when none apply to these parameters. */
  readonly classifier: Classifier | null;
  private readonly measure: PolarizationMeasure | null;
  private readonly positions: Float64Array;
  private readonly weights: Float64Array;
  private values = new Float64Array(64);
  private states = new Uint8Array(64);
  private cursor = 0;
  private maxRoundSeen = -1;
  /** Bumped whenever new values land (consumers re-render on change). */
  version = 0;
  /** Last per-round error message (e.g. empty support), for diagnostics. */
  lastError: string | null = null;

  constructor(spec: SeriesSpec) {
    this.spec = spec;
    this.positions = categoryPositions(spec.k);
    this.weights = new Float64Array(spec.k);
    let measure: PolarizationMeasure | null = null;
    let unavailable: string | null = null;
    if (!supportsCategories(spec.measureId, spec.k)) {
      unavailable = "unsupported-categories";
    } else {
      try {
        measure = createMeasure(spec.measureId, spec.params);
      } catch (err) {
        unavailable = isPolarizationError(err) ? err.message : "invalid-parameters";
      }
    }
    this.measure = measure;
    this.unavailable = unavailable;
    this.classifier = measure === null ? null : uiClassifier(measure);
  }

  /** Highest round with a computed state. */
  get maxRound(): number {
    return this.maxRoundSeen;
  }

  /** The value at `round` (null when not computed, undefined for the measure, or an error). */
  valueAt(round: number): number | null {
    if (round < 0 || round >= this.states.length || this.states[round] !== VALUE) return null;
    const value = this.values[round] as number;
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Computes the rounds recorded in `pool` since the last call, stopping once `budgetMs` has
   * elapsed. Returns whether the series caught up with the pool and whether anything changed.
   */
  update(
    pool: FineHistogramPool,
    budgetMs = 8,
    now: () => number = () => performance.now(),
  ): { done: boolean; changed: boolean } {
    if (this.measure === null) {
      this.cursor = pool.size;
      return { done: true, changed: false };
    }
    const start = now();
    let changed = false;
    const log = pool.log;
    while (this.cursor < pool.size) {
      const round = log[this.cursor] as number;
      this.cursor++;
      this.computeRound(pool, round);
      changed = true;
      if ((this.cursor & 15) === 0 && now() - start >= budgetMs) break;
    }
    if (changed) this.version++;
    return { done: this.cursor >= pool.size, changed };
  }

  /** [round, value | null] for rounds 0…upTo (null = gap), for the chart. */
  points(upTo = this.maxRoundSeen): Array<[number, number | null]> {
    const out: Array<[number, number | null]> = [];
    const last = Math.min(upTo, this.maxRoundSeen);
    for (let round = 0; round <= last; round++) {
      if (this.states[round] === PENDING) continue;
      out.push([round, this.valueAt(round)]);
    }
    return out;
  }

  private computeRound(pool: FineHistogramPool, round: number): void {
    this.ensure(round);
    const measure = this.measure as PolarizationMeasure;
    pool.categoryWeights(round, this.spec.belief, this.spec.k, this.weights);
    try {
      this.values[round] = measure.call(this.positions, this.weights);
      this.states[round] = VALUE;
    } catch (err) {
      if (!isPolarizationError(err)) throw err;
      this.states[round] = ERROR;
      this.lastError = err.message;
    }
    if (round > this.maxRoundSeen) this.maxRoundSeen = round;
  }

  private ensure(round: number): void {
    if (round < this.states.length) return;
    let capacity = this.states.length;
    while (capacity <= round) capacity *= 2;
    const values = new Float64Array(capacity);
    values.set(this.values);
    this.values = values;
    const states = new Uint8Array(capacity);
    states.set(this.states);
    this.states = states;
  }
}

const MAX_CACHED_SERIES = 16;

/** LRU of series for one pool. */
export class PolarizationSeriesCache {
  private readonly entries = new Map<string, PolarizationSeries>();

  get(spec: SeriesSpec): PolarizationSeries {
    const key = seriesKey(spec);
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const series = new PolarizationSeries(spec);
    this.entries.set(key, series);
    while (this.entries.size > MAX_CACHED_SERIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return series;
  }

  get size(): number {
    return this.entries.size;
  }
}

const caches = /* #__PURE__ */ new WeakMap<FineHistogramPool, PolarizationSeriesCache>();

/** The memo for a pool (created on first use, collected with the pool). */
export function seriesCacheFor(pool: FineHistogramPool): PolarizationSeriesCache {
  let cache = caches.get(pool);
  if (cache === undefined) {
    cache = new PolarizationSeriesCache();
    caches.set(pool, cache);
  }
  return cache;
}
