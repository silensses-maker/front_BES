import type { TopologyResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { benchProbe } from "@/shared/lib/bench-probe";

/**
 * Shared topology loads of the run being viewed (#140).
 *
 * Opening a run used to download the same full topology several times: the network selector
 * (first network), useSimulationStream's REST prefetch and the WS `topology_ready` handler each
 * called `getTopologyFull`, usually concurrently. Every caller now goes through
 * {@link loadTopology}:
 *
 * - concurrent calls for the same run and network share one download;
 * - a completed topology is kept for reuse — immutable once ready, so reuse is safe — but only
 *   for ONE run (a load for another run drops the previous run's entries) and at most
 *   {@link TOPOLOGY_CACHE_LIMIT} networks of it, least recently used evicted first;
 * - 202 "not ready" (null) and failures are never kept: the next call downloads again;
 * - the live-run page calls {@link releaseTopologies} when the user leaves the run, so no
 *   topology outlives the run view.
 *
 * No request is ever aborted (`getTopologyFull` takes no signal): a caller that stops waiting —
 * unmount, cancellation — only ignores the result, and the download keeps serving the others.
 */

/**
 * Completed topologies kept per run: the selector's first network plus the open one, so the
 * selector → run view path and going back and forth between two networks reuse their download.
 * A 100k-agent network is ~600k edges: the bound keeps at most one topology alive beyond the
 * ones the views already hold.
 */
export const TOPOLOGY_CACHE_LIMIT = 2;

interface TopologyEntry {
  /** The download, shared by every caller while it runs. */
  pending: Promise<TopologyResponse | null>;
  /** Set once the download resolved with a topology; null while it runs. */
  topology: TopologyResponse | null;
}

interface RunTopologies {
  runId: string;
  /** networkId → entry. Insertion order is recency: the first completed entry is the LRU one. */
  entries: Map<string, TopologyEntry>;
  /** The run view was left: completed topologies are dropped, running downloads not kept. */
  released: boolean;
}

let held: RunTopologies | null = null;

/** The entries of `runId`, dropping another run's; marks the run as viewed again. */
function acquire(runId: string): RunTopologies {
  if (held === null || held.runId !== runId) {
    held?.entries.clear();
    held = { runId, entries: new Map(), released: false };
  }
  // A StrictMode effect replay (dev) releases and reloads the run within one commit: the
  // downloads still running are joined again and kept once they complete.
  held.released = false;
  return held;
}

function touch(run: RunTopologies, networkId: string, entry: TopologyEntry): void {
  run.entries.delete(networkId);
  run.entries.set(networkId, entry);
}

function evictBeyondLimit(run: RunTopologies): void {
  let completed = 0;
  for (const entry of run.entries.values()) if (entry.topology !== null) completed++;
  for (const [networkId, entry] of run.entries) {
    if (completed <= TOPOLOGY_CACHE_LIMIT) break;
    if (entry.topology === null) continue;
    run.entries.delete(networkId);
    completed--;
  }
}

/** Records the outcome of a download, unless its entry was released or replaced meanwhile. */
function settle(
  run: RunTopologies,
  networkId: string,
  entry: TopologyEntry,
  topology: TopologyResponse | null,
): void {
  if (held !== run || run.entries.get(networkId) !== entry) return;
  if (topology === null || run.released) {
    run.entries.delete(networkId);
    return;
  }
  entry.topology = topology;
  touch(run, networkId, entry);
  evictBeyondLimit(run);
}

function download(run: RunTopologies, networkId: string): Promise<TopologyResponse | null> {
  const entry: TopologyEntry = {
    pending: simulationsApi.getTopologyFull(run.runId, networkId).then(
      (topology) => {
        settle(run, networkId, entry, topology);
        return topology;
      },
      (error: unknown) => {
        settle(run, networkId, entry, null);
        throw error;
      },
    ),
    topology: null,
  };
  run.entries.set(networkId, entry);
  return entry.pending;
}

function load(
  runId: string,
  networkId: string,
  retryJoined: boolean,
): Promise<TopologyResponse | null> {
  const run = acquire(runId);
  const entry = run.entries.get(networkId);
  if (entry === undefined) return download(run, networkId);

  if (entry.topology !== null) {
    touch(run, networkId, entry);
    if (__BENCHMARK__) benchProbe("topology-fetch-reuse", { runId, networkId });
    return Promise.resolve(entry.topology);
  }

  if (__BENCHMARK__) benchProbe("topology-fetch-join", { runId, networkId });
  if (!retryJoined) return entry.pending;
  // The joined download started before this call: its 202 can predate the topology becoming
  // ready (a `topology_ready` that arrives meanwhile), and before #140 every caller had a request
  // of its own, so one transient failure never cost a view its topology. A joiner that gets null
  // or an error back therefore makes one attempt of its own (later joiners share it) — unless the
  // run was left or replaced meanwhile.
  const stillViewed = () => held === run && !run.released;
  return entry.pending.then(
    (topology) => topology ?? (stillViewed() ? load(runId, networkId, false) : null),
    (error: unknown) => {
      if (stillViewed()) return load(runId, networkId, false);
      throw error;
    },
  );
}

/**
 * `simulationsApi.getTopologyFull`, shared: joins the download in flight for the same run and
 * network, or resolves with the topology of a completed one (see the module comment).
 * Resolves null on 202 "not ready"; rejects when the download fails.
 */
export function loadTopology(runId: string, networkId: string): Promise<TopologyResponse | null> {
  return load(runId, networkId, true);
}

/**
 * Drops the kept topologies of `runId` — called when the user leaves the run. Downloads still
 * running finish for their callers but are not kept. A no-op when another run is held, so a late
 * cleanup never drops the next run's entries.
 */
export function releaseTopologies(runId: string): void {
  const run = held;
  if (run === null || run.runId !== runId) return;
  run.released = true;
  for (const [networkId, entry] of run.entries) {
    if (entry.topology !== null) run.entries.delete(networkId);
  }
  if (run.entries.size === 0) held = null;
}

/** Test helper: forgets every entry, running downloads included. */
export function resetTopologyLoader(): void {
  held?.entries.clear();
  held = null;
}
