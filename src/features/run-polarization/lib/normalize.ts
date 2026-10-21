/**
 * "Normalized (shape)" y axis of the polarization comparison (#129): each series is rescaled to
 * [0, 1] by its own min–max over the rounds computed so far, x' = (x − min) / (max − min), so
 * measures on different scales can be compared by shape.
 *
 * A constant series (max = min, a single value included) has no shape to rescale: it is drawn
 * flat at CONSTANT_LEVEL, the middle of the axis, so it reads neither as "at its minimum" nor as
 * "at its maximum". Rounds without a value stay gaps.
 */

/**
 * Y axis of the comparison: the real values on one shared axis, or each series rescaled to [0, 1]
 * by its own min–max (shape). Only applies with two or more series.
 */
export type AxisMode = "values" | "normalized";

export interface ValueRange {
  min: number;
  max: number;
}

/** Where a constant series is drawn on the normalized axis. */
export const CONSTANT_LEVEL = 0.5;

/** Min and max of the finite values of `points` (null when there is none). */
export function valueRange(
  points: ReadonlyArray<readonly [number, number | null]>,
): ValueRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [, value] of points) {
    if (value === null || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? { min, max } : null;
}

/** `value` rescaled by `range` (null for no value or no range; CONSTANT_LEVEL when flat). */
export function normalizeValue(value: number | null, range: ValueRange | null): number | null {
  if (value === null || range === null || !Number.isFinite(value)) return null;
  const span = range.max - range.min;
  if (span <= 0) return CONSTANT_LEVEL;
  return (value - range.min) / span;
}

/** `points` rescaled by `range` (gaps kept). */
export function normalizePoints(
  points: ReadonlyArray<readonly [number, number | null]>,
  range: ValueRange | null,
): Array<[number, number | null]> {
  return points.map(([round, value]) => [round, normalizeValue(value, range)]);
}
