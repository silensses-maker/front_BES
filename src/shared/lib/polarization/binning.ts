/**
 * Polarization replica (#129) — discretization of continuous agent beliefs into the opinion
 * histograms the measures take. (Not part of pol_measures, which receives histograms.)
 *
 * Positions: k equally spaced category values in [0, 1], x_j = j/(k − 1) — the package's examples
 * (`x = [0, .25, .5, .75, 1]` for k = 5). Bins: a belief b ∈ [0, 1] falls in category
 * min(k − 1, ⌊b·k⌋), i.e. k equal-width intervals [j/k, (j+1)/k) with b = 1 in the last one.
 * Weights: the fraction of agents in each category (sums to 1, matching the package's
 * `normalize_weights=False` default).
 *
 * Per round only ONE fine histogram of FINE_BINS = 210 bins is kept per belief type. 210 is the
 * LCM of 3, 5, 7 and 10, so every supported k is an exact sum of 210/k consecutive fine bins:
 * ⌊⌊210·b⌋ / (210/k)⌋ = ⌊b·k⌋. For float32 beliefs both products are exact in float64, so the
 * identity holds bit for bit. Out-of-range values are clamped: b < 0 and NaN → bin 0, b ≥ 1 →
 * last bin.
 */

/** LCM(3, 5, 7, 10). */
export const FINE_BINS = 210;

export const CATEGORY_COUNTS = [3, 5, 7, 10] as const;
export type CategoryCount = (typeof CATEGORY_COUNTS)[number];
export const DEFAULT_CATEGORY_COUNT: CategoryCount = 5;

export function isCategoryCount(value: unknown): value is CategoryCount {
  return (CATEGORY_COUNTS as readonly unknown[]).includes(value);
}

/** Fine bin of a belief: min(209, ⌊210·b⌋), clamped to [0, 209] (NaN → 0). */
export function fineBinIndex(belief: number): number {
  const bin = Math.floor(belief * FINE_BINS);
  if (!(bin >= 0)) return 0;
  return bin >= FINE_BINS ? FINE_BINS - 1 : bin;
}

/** Category of a belief for k bins: min(k − 1, ⌊b·k⌋), clamped like `fineBinIndex`. */
export function categoryIndex(belief: number, k: number): number {
  const bin = Math.floor(belief * k);
  if (!(bin >= 0)) return 0;
  return bin >= k ? k - 1 : bin;
}

/** Adds every belief to its fine bin (`out` has FINE_BINS entries). O(n). */
export function accumulateFineHistogram(beliefs: ArrayLike<number>, out: Uint32Array): void {
  for (let i = 0; i < beliefs.length; i++) {
    const bin = Math.floor((beliefs[i] as number) * FINE_BINS);
    const index = bin >= 0 ? (bin >= FINE_BINS ? FINE_BINS - 1 : bin) : 0;
    out[index] = (out[index] as number) + 1;
  }
}

/** Category values j/(k − 1), j = 0…k−1. */
export function categoryPositions(k: number): Float64Array {
  const out = new Float64Array(k);
  for (let j = 0; j < k; j++) out[j] = j / (k - 1);
  return out;
}

/** k-category counts from a fine histogram: sums of 210/k consecutive fine bins. */
export function rebinCounts(
  fine: ArrayLike<number>,
  k: number,
  out: Float64Array = new Float64Array(k),
): Float64Array {
  if (FINE_BINS % k !== 0) throw new RangeError(`k = ${k} does not divide ${FINE_BINS}`);
  const width = FINE_BINS / k;
  for (let j = 0; j < k; j++) {
    let sum = 0;
    const start = j * width;
    for (let f = start; f < start + width; f++) sum += fine[f] as number;
    out[j] = sum;
  }
  return out;
}

/** Category weights (fractions) in place: counts / Σcounts. Returns Σcounts (0 = empty). */
export function toWeights(counts: Float64Array): number {
  let total = 0;
  for (const c of counts) total += c;
  if (total > 0) for (let j = 0; j < counts.length; j++) counts[j] = (counts[j] as number) / total;
  return total;
}
