import type { BenchProbeEvent } from "@/shared/lib/bench-probe";
import { chooseWindowStart } from "./layout-window";
import { EMPTY_LOAD_TIMINGS, type LoadTimings } from "./result-schema";

/**
 * Load timings of one network from the probe events (#126) — the real-run path:
 * topology fetch (+ Resource Timing for the network part, + per-page JSON parse) and the canvas
 * steps. Pure: events and resource entries are passed in.
 *
 * Topology loads are shared (#140): `topology-fetch-start` marks an actual download, while
 * `topology-fetch-join` / `topology-fetch-reuse` mark loads served by a download in flight or by
 * a completed one. A load whose topology was reused after the network's last download ended (the
 * selector's download when the network is opened) came from memory: it has no fetch steps and
 * starts at the reuse.
 */

export interface ResourceEntryLite {
  name: string;
  startTime: number;
  responseEnd: number;
}

const diff = (end: number | undefined, start: number | undefined): number | null =>
  end !== undefined && start !== undefined && end >= start ? end - start : null;

const forNetwork = (events: readonly BenchProbeEvent[], networkId: string, runId?: string) =>
  events.filter(
    (e) => e.detail.networkId === networkId && (runId === undefined || e.detail.runId === runId),
  );

/** The LAST occurrence of each canvas step (a remount reloads the network). */
function lastCanvasCycle(events: readonly BenchProbeEvent[]) {
  const starts = events.filter((e) => e.name === "canvas-prepare-start");
  const start = starts[starts.length - 1];
  if (start === undefined) return null;
  const after = events.filter((e) => e.at >= start.at);
  const first = (name: BenchProbeEvent["name"]) => after.find((e) => e.name === name)?.at;
  const layoutStart = first("canvas-layout-start");
  const frozen = first("canvas-frozen");
  const firstFrame =
    layoutStart !== undefined
      ? chooseWindowStart(after, {
          from: layoutStart,
          to: frozen ?? Number.POSITIVE_INFINITY,
          dataEvents: ["cosmograph-graph-rebuilt"],
        })
      : null;
  return {
    prepareStart: start.at,
    toDataEnd: first("canvas-to-data-end"),
    prepareEnd: first("canvas-prepare-end"),
    layoutStart,
    firstFrame: firstFrame ?? undefined,
    frozen,
  };
}

export function deriveLoadTimings(
  events: readonly BenchProbeEvent[],
  runId: string,
  networkId: string,
  resources: readonly ResourceEntryLite[] = [],
): LoadTimings {
  const mine = forNetwork(events, networkId, runId);
  const fetchStarts = mine.filter((e) => e.name === "topology-fetch-start");
  const fetchEnds = mine.filter((e) => e.name === "topology-fetch-end");
  const shared = mine.filter(
    (e) => e.name === "topology-fetch-join" || e.name === "topology-fetch-reuse",
  );
  const reuses = shared.filter((e) => e.name === "topology-fetch-reuse");
  const lastReuse = reuses[reuses.length - 1];
  const lastEnd = fetchEnds[fetchEnds.length - 1];
  const fromMemory =
    lastReuse !== undefined && (lastEnd === undefined || lastReuse.at > lastEnd.at);
  const firstStart = fromMemory ? undefined : fetchStarts[0];
  // The fetch that resolved first is the one whose topology reached the store.
  const winner = fromMemory ? undefined : fetchEnds[0];
  const winnerStart =
    fetchStarts.find((e) => e.detail.callId === winner?.detail.callId) ?? firstStart;

  let parseMs: number | null = null;
  let networkMs: number | null = null;
  if (winner !== undefined && firstStart !== undefined) {
    const parses = mine.filter(
      (e) => e.name === "topology-parse" && e.at >= firstStart.at && e.at <= winner.at,
    );
    parseMs = parses.reduce((sum, e) => sum + (e.detail.durationMs ?? 0), 0);
    const topologyPath = `/networks/${networkId}/topology`;
    const pages = resources.filter(
      (r) => r.name.includes(topologyPath) && r.startTime >= (winnerStart?.at ?? 0) - 1,
    );
    const lastByte = pages.reduce((max, r) => Math.max(max, r.responseEnd), 0);
    if (pages.length > 0) networkMs = diff(Math.min(lastByte, winner.at), winnerStart?.at);
  }

  const canvas = lastCanvasCycle(forNetwork(events, networkId));
  const begin = fromMemory ? lastReuse.at : (winnerStart?.at ?? canvas?.prepareStart);
  const topologyObserved = fetchStarts.length + shared.length > 0;
  return {
    ...EMPTY_LOAD_TIMINGS,
    fetchMs: diff(winner?.at, winnerStart?.at),
    networkMs,
    parseMs,
    toDataMs: diff(canvas?.toDataEnd, canvas?.prepareStart),
    prepareMs: diff(canvas?.prepareEnd, canvas?.toDataEnd),
    mountMs: diff(canvas?.layoutStart, canvas?.prepareEnd),
    layoutMs: diff(canvas?.frozen, canvas?.layoutStart),
    uploadMs: diff(canvas?.firstFrame, canvas?.layoutStart),
    totalMs: diff(canvas?.frozen, begin),
    topologyFetches: topologyObserved ? fetchStarts.length : null,
    topologyShared: topologyObserved ? shared.length : null,
  };
}
