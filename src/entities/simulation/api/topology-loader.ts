import type { TopologyResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { benchProbe } from "@/shared/lib/bench-probe";
import type { TopologyLoadProgress } from "@/shared/workers/topology-transfer";

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
 *
 * Progress (#128): every load served by a download — the one that started it and every joiner —
 * gets the same progress events (`onProgress`; a joiner first gets the latest one), and views
 * can observe the load status of a network ({@link subscribeTopologyLoad},
 * {@link getTopologyLoadStatus}) whoever started its download. A failed download (its pages are
 * retried before it fails, and it never yields part of a topology) leaves a `failed` status for
 * the error state until the next download of that network starts; the failure itself is not
 * reused, the next load downloads again.
 */

/**
 * Completed topologies kept per run: the selector's first network plus the open one, so the
 * selector → run view path and going back and forth between two networks reuse their download.
 * A 100k-agent network is ~600k edges: the bound keeps at most one topology alive beyond the
 * ones the views already hold.
 */
export const TOPOLOGY_CACHE_LIMIT = 2;

/** Load status of one network of the run being viewed. */
export type TopologyLoadStatus =
  /** Nothing in flight, nothing kept (not requested yet, 202, or the run was left). */
  | { phase: "idle" }
  /** A download runs; `progress` is null until its first event. */
  | { phase: "loading"; progress: TopologyLoadProgress | null }
  /** The last download failed and no other one runs. */
  | { phase: "failed"; error: unknown }
  /** A completed topology is kept. */
  | { phase: "ready" };

export interface LoadTopologyOptions {
  /** Progress of the download that serves this load (its own or the one it joined). */
  onProgress?: (progress: TopologyLoadProgress) => void;
}

type ProgressListener = (progress: TopologyLoadProgress) => void;

const IDLE: TopologyLoadStatus = { phase: "idle" };
const READY: TopologyLoadStatus = { phase: "ready" };
const STARTING: TopologyLoadStatus = { phase: "loading", progress: null };

interface TopologyEntry {
  /** The download, shared by every caller while it runs. */
  pending: Promise<TopologyResponse | null>;
  /** Set once the download resolved with a topology; null while it runs. */
  topology: TopologyResponse | null;
  /** Latest progress event, replayed to loads that join. */
  progress: TopologyLoadProgress | null;
  /** `onProgress` of the loads this download serves; cleared when it settles. */
  listeners: Set<ProgressListener>;
  /** Status object of the entry (stable between changes, for `useSyncExternalStore`). */
  status: TopologyLoadStatus;
}

interface RunTopologies {
  runId: string;
  /** networkId → entry. Insertion order is recency: the first completed entry is the LRU one. */
  entries: Map<string, TopologyEntry>;
  /** networkId → failed status of its last download, while no other download of it runs. */
  failures: Map<string, TopologyLoadStatus>;
  /** The run view was left: completed topologies are dropped, running downloads not kept. */
  released: boolean;
}

let held: RunTopologies | null = null;

// ─── Status observers ────────────────────────────────────────────────────────

/** `runId` + `networkId` → status listeners. Kept apart from `held`: views outlive entries. */
const observers = new Map<string, Set<() => void>>();

const observerKey = (runId: string, networkId: string) => `${runId}\u0000${networkId}`;

function notify(runId: string, networkId: string): void {
  const listeners = observers.get(observerKey(runId, networkId));
  if (listeners === undefined) return;
  for (const listener of [...listeners]) listener();
}

function notifyAll(): void {
  for (const listeners of [...observers.values()]) {
    for (const listener of [...listeners]) listener();
  }
}

/**
 * Calls `listener` whenever the load status of `networkId` (run `runId`) changes: a download
 * starts, progresses, completes or fails, or the run is left. Returns the unsubscribe function.
 */
export function subscribeTopologyLoad(
  runId: string,
  networkId: string,
  listener: () => void,
): () => void {
  const key = observerKey(runId, networkId);
  let listeners = observers.get(key);
  if (listeners === undefined) {
    listeners = new Set();
    observers.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = observers.get(key);
    current?.delete(listener);
    if (current?.size === 0) observers.delete(key);
  };
}

/** Current load status of `networkId` (run `runId`); the same object until it changes. */
export function getTopologyLoadStatus(runId: string, networkId: string): TopologyLoadStatus {
  if (held === null || held.runId !== runId) return IDLE;
  return held.entries.get(networkId)?.status ?? held.failures.get(networkId) ?? IDLE;
}

// ─── Entries ─────────────────────────────────────────────────────────────────

/** The entries of `runId`, dropping another run's; marks the run as viewed again. */
function acquire(runId: string): RunTopologies {
  if (held === null || held.runId !== runId) {
    const replaced = held !== null;
    held?.entries.clear();
    held = { runId, entries: new Map(), failures: new Map(), released: false };
    if (replaced) notifyAll();
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
    notify(run.runId, networkId);
  }
}

/** Records the outcome of a download, unless its entry was released or replaced meanwhile. */
function settle(
  run: RunTopologies,
  networkId: string,
  entry: TopologyEntry,
  outcome: { topology: TopologyResponse | null } | { error: unknown },
): void {
  entry.listeners.clear();
  if (held !== run || run.entries.get(networkId) !== entry) return;
  const topology = "topology" in outcome ? outcome.topology : null;
  if (topology === null || run.released) {
    run.entries.delete(networkId);
    if ("error" in outcome && !run.released) {
      run.failures.set(networkId, { phase: "failed", error: outcome.error });
    }
  } else {
    entry.topology = topology;
    entry.status = READY;
    touch(run, networkId, entry);
    evictBeyondLimit(run);
  }
  notify(run.runId, networkId);
}

function onEntryProgress(
  run: RunTopologies,
  networkId: string,
  entry: TopologyEntry,
  progress: TopologyLoadProgress,
): void {
  entry.progress = progress;
  entry.status = { phase: "loading", progress };
  for (const listener of [...entry.listeners]) listener(progress);
  if (held === run && run.entries.get(networkId) === entry) notify(run.runId, networkId);
}

function download(
  run: RunTopologies,
  networkId: string,
  onProgress: ProgressListener | undefined,
): Promise<TopologyResponse | null> {
  const entry: TopologyEntry = {
    pending: Promise.resolve(null),
    topology: null,
    progress: null,
    listeners: new Set(onProgress ? [onProgress] : []),
    status: STARTING,
  };
  run.entries.set(networkId, entry);
  run.failures.delete(networkId);
  entry.pending = simulationsApi
    .getTopologyFull(run.runId, networkId, {
      onProgress: (progress) => onEntryProgress(run, networkId, entry, progress),
    })
    .then(
      (topology) => {
        settle(run, networkId, entry, { topology });
        return topology;
      },
      (error: unknown) => {
        settle(run, networkId, entry, { error });
        throw error;
      },
    );
  notify(run.runId, networkId);
  return entry.pending;
}

function load(
  runId: string,
  networkId: string,
  retryJoined: boolean,
  options: LoadTopologyOptions,
): Promise<TopologyResponse | null> {
  const run = acquire(runId);
  const entry = run.entries.get(networkId);
  if (entry === undefined) return download(run, networkId, options.onProgress);

  if (entry.topology !== null) {
    touch(run, networkId, entry);
    if (__BENCHMARK__) benchProbe("topology-fetch-reuse", { runId, networkId });
    return Promise.resolve(entry.topology);
  }

  if (__BENCHMARK__) benchProbe("topology-fetch-join", { runId, networkId });
  // A joiner gets the same progress as every other load of this download, from where it is.
  if (options.onProgress !== undefined) {
    entry.listeners.add(options.onProgress);
    if (entry.progress !== null) options.onProgress(entry.progress);
  }
  if (!retryJoined) return entry.pending;
  // The joined download started before this call: its 202 can predate the topology becoming
  // ready (a `topology_ready` that arrives meanwhile), and before #140 every caller had a request
  // of its own, so one transient failure never cost a view its topology. A joiner that gets null
  // or an error back therefore makes one attempt of its own (later joiners share it) — unless the
  // run was left or replaced meanwhile.
  const stillViewed = () => held === run && !run.released;
  return entry.pending.then(
    (topology) => topology ?? (stillViewed() ? load(runId, networkId, false, options) : null),
    (error: unknown) => {
      if (stillViewed()) return load(runId, networkId, false, options);
      throw error;
    },
  );
}

/**
 * `simulationsApi.getTopologyFull`, shared: joins the download in flight for the same run and
 * network, or resolves with the topology of a completed one (see the module comment).
 * Resolves null on 202 "not ready"; rejects when the download fails.
 */
export function loadTopology(
  runId: string,
  networkId: string,
  options: LoadTopologyOptions = {},
): Promise<TopologyResponse | null> {
  return load(runId, networkId, true, options);
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
  const changed = [...run.failures.keys()];
  run.failures.clear();
  for (const [networkId, entry] of run.entries) {
    if (entry.topology !== null) {
      run.entries.delete(networkId);
      changed.push(networkId);
    }
  }
  if (run.entries.size === 0) held = null;
  for (const networkId of changed) notify(runId, networkId);
}

/** Test helper: forgets every entry and status listener, running downloads included. */
export function resetTopologyLoader(): void {
  held?.entries.clear();
  held = null;
  observers.clear();
}
