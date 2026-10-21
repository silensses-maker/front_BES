/**
 * The polarization table (#129): which rounds it lists, what each cell holds, which rows are
 * rendered (virtualized, fixed row height) and how it follows the playhead. Pure functions over the
 * series' per-round answers (PolarizationSeries implements RoundSource).
 */

/** A series' per-round answers, as the table and the CSV read them. */
export interface RoundSource {
  /** The highest round answered so far (-1 = none). */
  readonly maxRound: number;
  /** Whether the server has answered `round` (a value, none, or the package's error). */
  answeredAt(round: number): boolean;
  /** The value at `round`, null when not answered or without a value. */
  valueAt(round: number): number | null;
  /** The package's level at `round` (null without thresholds or value). */
  levelAt(round: number): string | null;
  /** The package's error at `round` (e.g. an empty histogram), null otherwise. */
  errorAt(round: number): string | null;
}

/**
 * The rounds the table lists, ascending: every round some series has answered (a live run keeps
 * adding rows). Rounds can be answered in any order (live tail + cold-load sweep).
 */
export function tableRounds(sources: ReadonlyArray<RoundSource | null>): number[] {
  const present = sources.filter((source): source is RoundSource => source !== null);
  let last = -1;
  for (const source of present) last = Math.max(last, source.maxRound);
  const rounds: number[] = [];
  for (let round = 0; round <= last; round++) {
    if (present.some((source) => source.answeredAt(round))) rounds.push(round);
  }
  return rounds;
}

/** What a cell shows. */
export type TableCell =
  | { kind: "value"; value: number; level: string | null }
  /** Not computed yet (the request has not reached this round, or failed). */
  | { kind: "pending" }
  /** Computed: the package raised for this round (e.g. an empty histogram). */
  | { kind: "error"; message: string }
  /** Computed: no value for this round. */
  | { kind: "none" }
  /** The measure is not defined for the column's k: nothing is requested. */
  | { kind: "unsupported" };

export function tableCell(
  source: RoundSource | null,
  supported: boolean,
  round: number,
): TableCell {
  if (!supported) return { kind: "unsupported" };
  if (source === null || !source.answeredAt(round)) return { kind: "pending" };
  const value = source.valueAt(round);
  if (value !== null) return { kind: "value", value, level: source.levelAt(round) };
  const message = source.errorAt(round);
  return message === null ? { kind: "none" } : { kind: "error", message };
}

/** Position of `round` in the ascending `rounds` (binary search), -1 when it is not listed. */
export function roundIndex(rounds: readonly number[], round: number): number {
  let low = 0;
  let high = rounds.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = rounds[mid] as number;
    if (value === round) return mid;
    if (value < round) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export interface WindowInput {
  /** Rows in the table. */
  count: number;
  rowHeight: number;
  /** The scroll container's scrollTop and height (the sticky header included). */
  scrollTop: number;
  viewportHeight: number;
  /** Extra rows rendered above and below the visible ones. */
  overscan: number;
}

export interface RowWindow {
  /** Rendered rows: [start, end). */
  start: number;
  end: number;
  /** Heights of the spacers that stand for the rows not rendered. */
  padTop: number;
  padBottom: number;
}

/** The rows to render for a scroll position (everything off screen is a spacer). */
export function visibleWindow({
  count,
  rowHeight,
  scrollTop,
  viewportHeight,
  overscan,
}: WindowInput): RowWindow {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, first + visible + overscan);
  return {
    start,
    end: Math.max(start, end),
    padTop: start * rowHeight,
    padBottom: Math.max(0, count - Math.max(start, end)) * rowHeight,
  };
}

export interface RevealInput {
  /** The row to show. */
  index: number;
  rowHeight: number;
  /** The sticky header, which covers the top of the viewport. */
  headerHeight: number;
  scrollTop: number;
  viewportHeight: number;
}

/** Whether the row is entirely visible below the sticky header. */
export function rowInView({
  index,
  rowHeight,
  headerHeight,
  scrollTop,
  viewportHeight,
}: RevealInput): boolean {
  const top = headerHeight + index * rowHeight;
  return top >= scrollTop + headerHeight && top + rowHeight <= scrollTop + viewportHeight;
}

/**
 * The scrollTop that brings the row into view with the least movement (aligned to the top under
 * the header when it is above, to the bottom when below), or null when it is already in view.
 */
export function revealScrollTop(input: RevealInput): number | null {
  if (input.index < 0 || rowInView(input)) return null;
  const { index, rowHeight, headerHeight, scrollTop, viewportHeight } = input;
  const top = headerHeight + index * rowHeight;
  if (top < scrollTop + headerHeight) return index * rowHeight;
  return Math.max(0, top + rowHeight - viewportHeight);
}

/** A move of the playhead larger than this (or backwards) is a seek, not playback. */
export const SEEK_JUMP_ROUNDS = 50;

/**
 * Whether the table should bring the new current round into view: always on a seek (backwards, or
 * a jump), and during playback only while it follows (the user has not scrolled the current row
 * out of view).
 */
export function shouldReveal(following: boolean, previous: number | null, next: number): boolean {
  if (following || previous === null) return true;
  return next < previous || next - previous > SEEK_JUMP_ROUNDS;
}
