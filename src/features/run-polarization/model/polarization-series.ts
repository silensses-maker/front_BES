import {
  type PolarizationClassification,
  type PolarizationRequest,
  type PolarizationResult,
  simulationsApi,
} from "@/shared/api/backend";
import type { BeliefKind, FineHistogramPool } from "@/shared/lib/polarization";
import { type PolarizationErrorInfo, polarizationErrorOf } from "../lib/polarization-error";
import type { ParamValues } from "./polarization-settings.store";

/**
 * Polarization (#129) — one measure's per-round series, computed on the SERVER by pol_measures
 * (`POST /simulations/polarization`) from the k-category counts of the run's fine histograms, and
 * cached per (run/network pool, measure, params, k, belief).
 *
 * Incremental: the series remembers how far into the pool's arrival log it has been answered and
 * only sends the rounds recorded since (at most CHUNK_ROUNDS per request). While a cold load or a
 * long run is being caught up, full chunks go back to back; once caught up, a live run sends what
 * is new at most every LIVE_INTERVAL_MS. One request is in flight at a time. A failed request
 * stops the series in `error` until `retry()` — there is no client-side fallback.
 */

export interface SeriesSpec {
  measureId: string;
  params: ParamValues;
  k: number;
  belief: BeliefKind;
}

export type SeriesStatus = "idle" | "loading" | "ready" | "error";

export type ComputePolarization = (body: PolarizationRequest) => Promise<PolarizationResult>;

/** Rounds per request (the server accepts up to catalog.limits.maxRounds). */
export const CHUNK_ROUNDS = 5000;
/** A streaming run sends its new rounds at most this often. */
export const LIVE_INTERVAL_MS = 2000;

/** Per-round state. */
const PENDING = 0;
const VALUE = 1;
const NO_VALUE = 2;

/** Stable key of a spec (parameter order does not matter). */
export function seriesKey({ measureId, params, k, belief }: SeriesSpec): string {
  const entries = Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `${name}=${JSON.stringify(params[name] ?? null)}`);
  return [measureId, ...entries, `k=${k}`, belief].join("|");
}

const defaultCompute: ComputePolarization = (body) => simulationsApi.computePolarization(body);

export class PolarizationSeries {
  readonly spec: SeriesSpec;
  readonly key: string;
  status: SeriesStatus = "idle";
  error: PolarizationErrorInfo | null = null;
  /** Thresholds that apply to these parameters (from the server's answer), null = none. */
  classification: PolarizationClassification | null = null;
  /** The pol_measures commit the server computed with. */
  packageRef: string | null = null;
  /** The pol_measures version the server computed with (the CSV export records it). */
  packageVersion: string | null = null;
  /** Bumped on every change (re-render signal). */
  version = 0;

  private readonly compute: ComputePolarization;
  private values = new Float64Array(64);
  private states = new Uint8Array(64);
  private levels: Array<string | null> = [];
  private errors: Array<string | null> = [];
  private cursor = 0;
  private maxRoundSeen = -1;
  private inFlight: Promise<void> | null = null;
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private lastChunkFull = false;

  constructor(spec: SeriesSpec, compute: ComputePolarization = defaultCompute) {
    this.spec = spec;
    this.key = seriesKey(spec);
    this.compute = compute;
  }

  /** Entries of the pool's arrival log answered so far. */
  get answered(): number {
    return this.cursor;
  }

  /** The request in flight, if any. */
  get pending(): Promise<void> | null {
    return this.inFlight;
  }

  get hasValues(): boolean {
    return this.maxRoundSeen >= 0;
  }

  /** The highest round answered so far (-1 = none). */
  get maxRound(): number {
    return this.maxRoundSeen;
  }

  /** Whether the server has answered `round` (with a value, none, or the package's error). */
  answeredAt(round: number): boolean {
    return round >= 0 && round < this.states.length && this.states[round] !== PENDING;
  }

  /** The value at `round` (null when not computed yet, undefined for the measure or an error). */
  valueAt(round: number): number | null {
    if (round < 0 || round >= this.states.length || this.states[round] !== VALUE) return null;
    return this.values[round] as number;
  }

  /** The package's level at `round` (null without classification or value). */
  levelAt(round: number): string | null {
    return this.levels[round] ?? null;
  }

  /** The package's error at `round` (e.g. an empty histogram), null otherwise. */
  errorAt(round: number): string | null {
    return this.errors[round] ?? null;
  }

  /** [round, value | null] for every answered round in order (null = gap), for the chart. */
  points(): Array<[number, number | null]> {
    const out: Array<[number, number | null]> = [];
    for (let round = 0; round <= this.maxRoundSeen; round++) {
      if (this.states[round] === PENDING) continue;
      out.push([round, this.valueAt(round)]);
    }
    return out;
  }

  /**
   * Milliseconds until the next request may be sent (0 = now), or null when there is nothing to
   * send or the series waits (a request in flight, or an error until `retry()`).
   */
  nextSyncDelay(pool: FineHistogramPool, now: number): number | null {
    if (this.inFlight !== null || this.status === "error") return null;
    if (pool.size <= this.cursor) return null;
    if (this.cursor === 0 || this.lastChunkFull) return 0;
    return Math.max(0, this.lastRequestAt + LIVE_INTERVAL_MS - now);
  }

  /** Sends the next rounds of the pool not answered yet (at most CHUNK_ROUNDS). */
  sync(pool: FineHistogramPool, now: number = performance.now()): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    const start = this.cursor;
    const end = Math.min(pool.size, start + CHUNK_ROUNDS);
    if (end <= start) return Promise.resolve();

    const { measureId, params, k, belief } = this.spec;
    const rounds = Array.from(pool.log.subarray(start, end));
    const counts = new Float64Array(k);
    const histograms = rounds.map((round) => {
      pool.categoryCounts(round, belief, k, counts);
      return Array.from(counts);
    });
    this.lastRequestAt = now;
    this.lastChunkFull = end - start === CHUNK_ROUNDS;
    this.status = "loading";
    this.version++;

    this.inFlight = this.compute({ measure: measureId, params, k, histograms })
      .then((result) => {
        if (result.values.length !== rounds.length) {
          throw new Error(`${result.values.length} values for ${rounds.length} histograms`);
        }
        this.store(rounds, result);
        this.cursor = end;
        this.classification = result.classification;
        this.packageRef = result.package?.ref ?? null;
        this.packageVersion = result.package?.version ?? null;
        this.status = "ready";
        this.error = null;
      })
      .catch((err: unknown) => {
        this.status = "error";
        this.error = polarizationErrorOf(err);
      })
      .finally(() => {
        this.inFlight = null;
        this.version++;
      });
    return this.inFlight;
  }

  /** Clears an error: the next `nextSyncDelay` schedules the request again. */
  retry(): void {
    if (this.status !== "error") return;
    this.status = this.hasValues ? "ready" : "idle";
    this.error = null;
    this.version++;
  }

  private store(rounds: readonly number[], result: PolarizationResult): void {
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i] as number;
      this.ensure(round);
      const value = result.values[i];
      if (typeof value === "number" && Number.isFinite(value)) {
        this.values[round] = value;
        this.states[round] = VALUE;
      } else {
        this.states[round] = NO_VALUE;
      }
      this.levels[round] = result.levels[i] ?? null;
      this.errors[round] = result.errors?.[i] ?? null;
      if (round > this.maxRoundSeen) this.maxRoundSeen = round;
    }
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

/**
 * Series kept per pool: the compared series (up to MAX_SERIES) and the table's "all measures"
 * (one per catalog measure) all stay cached, with room to go back to earlier specs.
 */
export const MAX_CACHED_SERIES = 32;

/** LRU of series for one pool (one run / network). */
export class PolarizationSeriesCache {
  private readonly entries = new Map<string, PolarizationSeries>();
  private readonly compute: ComputePolarization;

  constructor(compute: ComputePolarization = defaultCompute) {
    this.compute = compute;
  }

  get(spec: SeriesSpec): PolarizationSeries {
    const key = seriesKey(spec);
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const series = new PolarizationSeries(spec, this.compute);
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

/** The cache of a pool (created on first use, collected with the pool: a new run or network). */
export function seriesCacheFor(pool: FineHistogramPool): PolarizationSeriesCache {
  let cache = caches.get(pool);
  if (cache === undefined) {
    cache = new PolarizationSeriesCache();
    caches.set(pool, cache);
  }
  return cache;
}
