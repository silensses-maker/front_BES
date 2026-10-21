import { type SeriesSpec, seriesKey } from "./polarization-series";

/**
 * Polarization comparison (#129): how the requests of several series share the server.
 *
 *  - One request in flight at a time across the compared series (each series already sends one at
 *    a time, chunked to CHUNK_ROUNDS and, once caught up, at most every LIVE_INTERVAL_MS).
 *  - Round-robin among the series that may send now: after a series is served, the next due one
 *    in chip order goes first, so a long catch-up of one series does not starve the others.
 *  - Each compared series' spec is debounced on its own (by its stable id): a new series, a
 *    removed one, or a series that has no spec yet or no longer has one apply at once.
 */

export interface SyncCandidate {
  /** The series' key (seriesKey). */
  key: string;
  /** Its `nextSyncDelay`: ms until it may send (0 = now), null = nothing to send / waits. */
  delay: number | null;
}

/**
 * The series to serve next: the first one due (delay 0) after `lastServed` in list order,
 * wrapping around; when none is due, the one due soonest with its delay; null when none waits.
 */
export function nextToSync(
  candidates: readonly SyncCandidate[],
  lastServed: string | null,
): { index: number; delay: number } | null {
  const n = candidates.length;
  const last = lastServed === null ? -1 : candidates.findIndex((c) => c.key === lastServed);
  let soonest: { index: number; delay: number } | null = null;
  for (let step = 1; step <= n; step++) {
    const index = (last + step) % n;
    const delay = (candidates[index] as SyncCandidate).delay;
    if (delay === null) continue;
    if (delay <= 0) return { index, delay: 0 };
    if (soonest === null || delay < soonest.delay) soonest = { index, delay };
  }
  return soonest;
}

/** A compared series' spec, by the series' stable id (null = no series, e.g. k unsupported). */
export interface SpecEntry {
  id: number;
  spec: SeriesSpec | null;
}

/** Identity of a list of entries (ids and spec keys, in order). */
export function entriesKey(entries: readonly SpecEntry[]): string {
  return entries.map(({ id, spec }) => `${id}:${spec === null ? "-" : seriesKey(spec)}`).join("\n");
}

/**
 * The entries to use now, given the ones applied so far and the current ones: every current entry,
 * except that a series whose spec CHANGED (same id, both specs present, another key) keeps its
 * applied spec until the debounce ends. `pending` = some change waits.
 */
export function debounceEntries(
  applied: readonly SpecEntry[],
  current: readonly SpecEntry[],
): { entries: SpecEntry[]; pending: boolean } {
  const before = new Map(applied.map((entry) => [entry.id, entry.spec]));
  let pending = false;
  const entries = current.map((entry) => {
    const previous = before.get(entry.id);
    if (previous === undefined || previous === null || entry.spec === null) return entry;
    if (seriesKey(previous) === seriesKey(entry.spec)) return entry;
    pending = true;
    return { id: entry.id, spec: previous };
  });
  return { entries, pending };
}
