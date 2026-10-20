/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 *
 * The few numpy semantics the measures depend on, reproduced in the same floating-point order so
 * results match the Python package bit for bit where the arithmetic allows it:
 *  - `np.sum` on a contiguous float64 array is numpy's pairwise summation (8 accumulators, blocks
 *    of 128), not a left-to-right loop. The optimizer's comparisons near a flat minimum are
 *    sensitive to the last bits of the objective, so the order matters.
 *  - `np.sign`, and Python's two-argument `min` (returns the first argument on ties and NaN).
 */

/** numpy's PW_BLOCKSIZE (numpy/_core/src/umath/loops_utils.h.src). */
const PW_BLOCKSIZE = 128;

function pairwise(a: ArrayLike<number>, start: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[start + i] as number;
    return res;
  }
  if (n <= PW_BLOCKSIZE) {
    let r0 = a[start] as number;
    let r1 = a[start + 1] as number;
    let r2 = a[start + 2] as number;
    let r3 = a[start + 3] as number;
    let r4 = a[start + 4] as number;
    let r5 = a[start + 5] as number;
    let r6 = a[start + 6] as number;
    let r7 = a[start + 7] as number;
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      const o = start + i;
      r0 += a[o] as number;
      r1 += a[o + 1] as number;
      r2 += a[o + 2] as number;
      r3 += a[o + 3] as number;
      r4 += a[o + 4] as number;
      r5 += a[o + 5] as number;
      r6 += a[o + 6] as number;
      r7 += a[o + 7] as number;
    }
    let res = r0 + r1 + (r2 + r3) + (r4 + r5 + (r6 + r7));
    for (; i < n; i++) res += a[start + i] as number;
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwise(a, start, n2) + pairwise(a, start + n2, n - n2);
}

/** `np.sum(a)` for a 1-D (or C-contiguous, flattened) float64 array. */
export function npSum(a: ArrayLike<number>): number {
  return 0 + pairwise(a, 0, a.length);
}

/** `np.sign`: −1, 0 or 1, NaN for NaN. */
export function npSign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  if (value === 0) return 0;
  return Number.NaN;
}

/** Python's built-in `min(a, b)`: `b` only when `b < a`, so ties and NaN keep `a`. */
export function pyMin(a: number, b: number): number {
  return b < a ? b : a;
}

/** `np.max` / `np.min` of a non-empty array (NaN propagates, as in numpy). */
export function npMax(a: ArrayLike<number>): number {
  let best = a[0] as number;
  for (let i = 1; i < a.length; i++) {
    const v = a[i] as number;
    if (Number.isNaN(v)) return Number.NaN;
    if (v > best) best = v;
  }
  return best;
}

export function npMin(a: ArrayLike<number>): number {
  let best = a[0] as number;
  for (let i = 1; i < a.length; i++) {
    const v = a[i] as number;
    if (Number.isNaN(v)) return Number.NaN;
    if (v < best) best = v;
  }
  return best;
}

/** `math.isclose(a, b, rel_tol=relTol)` (abs_tol = 0). */
export function isClose(a: number, b: number, relTol: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(b - a);
  return diff <= Math.abs(relTol * b) || diff <= Math.abs(relTol * a);
}
