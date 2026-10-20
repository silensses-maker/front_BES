/**
 * Polarization replica (#129) — compact per-round store of the 210-bin fine histograms.
 *
 * One contiguous typed array holds [round][belief][bin] (belief 0 = public, 1 = private), grown by
 * doubling. Counts are Uint16 (840 B per round) and switch to Uint32 the first time a bin exceeds
 * 65 535 agents. Rounds may arrive in any order (live tail + cold-load sweep) and are recorded
 * once; `log` keeps the arrival order so consumers can process only what is new.
 */

import { FINE_BINS, rebinCounts, toWeights } from "./binning";

export type BeliefKind = "public" | "private";

const BELIEF_OFFSET: Readonly<Record<BeliefKind, number>> = { public: 0, private: FINE_BINS };
const ROUND_STRIDE = 2 * FINE_BINS;
const UINT16_MAX = 0xffff;
const INITIAL_ROUNDS = 64;

export class FineHistogramPool {
  private counts: Uint16Array | Uint32Array = new Uint16Array(INITIAL_ROUNDS * ROUND_STRIDE);
  private present = new Uint8Array(INITIAL_ROUNDS);
  private arrivals = new Int32Array(INITIAL_ROUNDS);
  private arrivalCount = 0;
  private scratch = new Float64Array(FINE_BINS);

  /** Number of rounds recorded. */
  get size(): number {
    return this.arrivalCount;
  }

  /** Rounds in arrival order; entries [0, size) are valid. */
  get log(): Int32Array {
    return this.arrivals;
  }

  /** Bytes held by the typed arrays (memory reporting). */
  get byteLength(): number {
    return this.counts.byteLength + this.present.byteLength + this.arrivals.byteLength;
  }

  has(round: number): boolean {
    return round >= 0 && round < this.present.length && this.present[round] === 1;
  }

  /** Stores both histograms of `round` (ignored if the round is already recorded). */
  record(round: number, publicFine: ArrayLike<number>, privateFine: ArrayLike<number>): void {
    if (round < 0 || this.has(round)) return;
    this.ensureRound(round);
    let peak = 0;
    for (let f = 0; f < FINE_BINS; f++) {
      const a = publicFine[f] as number;
      const b = privateFine[f] as number;
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    if (peak > UINT16_MAX && this.counts instanceof Uint16Array) {
      this.counts = Uint32Array.from(this.counts);
    }
    const base = round * ROUND_STRIDE;
    for (let f = 0; f < FINE_BINS; f++) {
      this.counts[base + f] = publicFine[f] as number;
      this.counts[base + FINE_BINS + f] = privateFine[f] as number;
    }
    this.present[round] = 1;
    if (this.arrivalCount === this.arrivals.length) {
      const grown = new Int32Array(this.arrivals.length * 2);
      grown.set(this.arrivals);
      this.arrivals = grown;
    }
    this.arrivals[this.arrivalCount++] = round;
  }

  /** Read-only view of a recorded round's fine histogram (null when absent). */
  fine(round: number, belief: BeliefKind): Uint16Array | Uint32Array | null {
    if (!this.has(round)) return null;
    const start = round * ROUND_STRIDE + BELIEF_OFFSET[belief];
    return this.counts.subarray(start, start + FINE_BINS);
  }

  /**
   * Fills `out` (length k) with the round's k-category weights. Returns the agent count of the
   * round (0 = absent or empty; `out` then holds zeros).
   */
  categoryWeights(round: number, belief: BeliefKind, k: number, out: Float64Array): number {
    const fine = this.fine(round, belief);
    if (fine === null) {
      out.fill(0);
      return 0;
    }
    for (let f = 0; f < FINE_BINS; f++) this.scratch[f] = fine[f] as number;
    rebinCounts(this.scratch, k, out);
    return toWeights(out);
  }

  private ensureRound(round: number): void {
    if (round < this.present.length) return;
    let capacity = this.present.length;
    while (capacity <= round) capacity *= 2;
    const counts =
      this.counts instanceof Uint16Array
        ? new Uint16Array(capacity * ROUND_STRIDE)
        : new Uint32Array(capacity * ROUND_STRIDE);
    counts.set(this.counts);
    this.counts = counts;
    const present = new Uint8Array(capacity);
    present.set(this.present);
    this.present = present;
  }
}
