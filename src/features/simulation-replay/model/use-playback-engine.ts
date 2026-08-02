import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import {
  chunkBoundsFor,
  chunkRoundsFor,
  type IndexedChunk,
  indexChunkBuffer,
  mergeRoundFromChunk,
  readLastRoundHeader,
} from "../lib/replay-chunks";

/**
 * "live"    — run still producing rounds and the viewer follows the tail
 *             (the WS renders; the engine is passive).
 * The rest  — replay machinery states over already-received/persisted rounds,
 *             both for finished runs (#89) and for a live run the user
 *             detached from by scrubbing.
 */
export type PlaybackStatus =
  | "idle"
  | "live"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "unavailable"
  | "error";

export type PlaybackSpeed = 1 | 4 | 16 | 64;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [1, 4, 16, 64];

/** Rounds per second at ×1 speed. */
const BASE_RPS = 10;
/** Max raw chunks kept in memory (LRU). */
const MAX_CACHED_CHUNKS = 4;

/** Mockup's initial speed heuristic: nearest power of two of R/140, clamped. */
export function autoSpeed(totalRounds: number): PlaybackSpeed {
  const raw = 2 ** Math.round(Math.log2(Math.max(1, totalRounds / 140)));
  const clamped = Math.max(1, Math.min(64, raw));
  let best: PlaybackSpeed = 1;
  for (const speed of PLAYBACK_SPEEDS) {
    if (Math.abs(speed - clamped) < Math.abs(best - clamped)) best = speed;
  }
  return best;
}

export interface UsePlaybackEngineReturn {
  status: PlaybackStatus;
  /** Run still producing rounds (store status running/connecting). */
  isLive: boolean;
  /** Viewed round pinned to the live tail. */
  follow: boolean;
  currentRound: number;
  receivedRound: number;
  /** Known once the run finished (probe or store); null while live. */
  finalRound: number | null;
  speed: PlaybackSpeed;
  isPlaying: boolean;
  /** Mid-run frames endpoint unavailable — scrubbing disabled until the run ends. */
  liveScrubBlocked: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (round: number) => void;
  stepBy: (delta: number) => void;
  returnToLive: () => void;
  /** ⏭ semantics: live → re-attach to the tail; finished → jump to the end. */
  goToEnd: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  retry: () => void;
}

function isLiveStatus(status: string): boolean {
  return status === "running" || status === "connecting";
}

/**
 * Unified playback engine for the run viewer: one round cursor over a live
 * stream (follow / detached review) and over persisted frames of finished
 * runs (#89 chunked REST replay). Renders the viewed round into the
 * simulation store (`updateFrame`), which repaints the frozen canvas.
 *
 * The caller must have seeded the store (topology + status) before
 * `agentCount` becomes non-null; the engine only writes finalRound, follow
 * and viewed frames.
 */
export function usePlaybackEngine(
  runId: string,
  networkId: string,
  agentCount: number | null,
): UsePlaybackEngineReturn {
  const { t } = useTranslation();

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [finalRound, setFinalRound] = useState<number | null>(null);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const [liveScrubBlocked, setLiveScrubBlocked] = useState(false);
  const [initNonce, setInitNonce] = useState(0);

  const storeStatus = useSimulationStore((s) => s.status);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const receivedRound = useSimulationStore((s) => s.receivedRound);
  const follow = useSimulationStore((s) => s.follow);

  const isLive = isLiveStatus(storeStatus);

  const statusRef = useRef<PlaybackStatus>("idle");
  const speedRef = useRef<PlaybackSpeed>(1);
  const finalRoundRef = useRef<number | null>(null);
  const liveScrubBlockedRef = useRef(false);
  const playheadRef = useRef(0);
  const renderedRoundRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const seekTokenRef = useRef(0);
  const chunksRef = useRef(new Map<number, IndexedChunk>());
  const inflightRef = useRef(new Map<number, Promise<IndexedChunk | null>>());

  const chunkRounds = agentCount !== null ? chunkRoundsFor(agentCount) : null;

  const transition = useCallback((next: PlaybackStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopDriver = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTickRef.current = null;
  }, []);

  /** Highest seekable round: persisted end when known, else the live tail. */
  const clampMax = useCallback((): number => {
    return finalRoundRef.current ?? useSimulationStore.getState().receivedRound;
  }, []);

  const applyAutoSpeed = useCallback((totalRounds: number) => {
    const next = autoSpeed(totalRounds);
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  /** Frames endpoint 404 while the run is still producing → follow-only mode. */
  const blockLiveScrub = useCallback(() => {
    if (liveScrubBlockedRef.current) return;
    liveScrubBlockedRef.current = true;
    setLiveScrubBlocked(true);
    toast.warning(t("runView.liveScrubUnavailableToast"));
    stopDriver();
    useSimulationStore.getState().setFollow(true);
    const received = useSimulationStore.getState().receivedFrame;
    if (received !== null) useSimulationStore.getState().updateFrame(received);
    statusRef.current = "live";
    setStatus("live");
  }, [stopDriver, t]);

  /** Fetches (or returns cached) chunk starting at `from`, with LRU + in-flight dedupe. */
  const ensureChunk = useCallback(
    (from: number): Promise<IndexedChunk | null> => {
      const cached = chunksRef.current.get(from);
      if (cached) {
        // Refresh LRU position
        chunksRef.current.delete(from);
        chunksRef.current.set(from, cached);
        return Promise.resolve(cached);
      }
      const inflight = inflightRef.current.get(from);
      if (inflight) return inflight;
      if (chunkRounds === null) return Promise.resolve(null);

      const to = Math.min(from + chunkRounds - 1, clampMax());
      if (to < from) return Promise.resolve(null);
      const promise = simulationsApi
        .getFrames(runId, networkId, { from, to })
        .then((buffer) => {
          inflightRef.current.delete(from);
          if (buffer === null) return null;
          const chunk: IndexedChunk = { from, to, buffer, rounds: indexChunkBuffer(buffer) };
          chunksRef.current.set(from, chunk);
          while (chunksRef.current.size > MAX_CACHED_CHUNKS) {
            const oldest = chunksRef.current.keys().next().value;
            if (oldest === undefined) break;
            chunksRef.current.delete(oldest);
          }
          return chunk;
        })
        .catch((err: unknown) => {
          inflightRef.current.delete(from);
          throw err;
        });
      inflightRef.current.set(from, promise);
      return promise;
    },
    [runId, networkId, chunkRounds, clampMax],
  );

  /** Merges and pushes `round` from an already-cached chunk. Returns false on cache miss. */
  const renderFromCache = useCallback(
    (round: number): boolean => {
      if (chunkRounds === null || agentCount === null) return false;
      const { from, to } = chunkBoundsFor(round, chunkRounds, clampMax());
      const chunk = chunksRef.current.get(from);
      if (!chunk) return false;
      if (round > chunk.to) {
        // Partial chunk fetched while live — now stale; refetch with wider bounds
        chunksRef.current.delete(from);
        return false;
      }

      const frame = mergeRoundFromChunk(chunk, round, agentCount);
      if (frame !== null) {
        useSimulationStore.getState().updateFrame(frame);
      }
      renderedRoundRef.current = round;

      // Prefetch the next chunk when the playhead approaches this chunk's end
      const prefetchAt = to - Math.ceil(chunkRounds / 4);
      if (round >= prefetchAt && to < clampMax()) {
        ensureChunk(to + 1).catch((err: unknown) => {
          logger.error("usePlaybackEngine.prefetch", err);
        });
      }
      return true;
    },
    [agentCount, chunkRounds, clampMax, ensureChunk],
  );

  /**
   * Renders `round`, fetching its chunk first if needed. `resumeTo` is the
   * status to restore once an async fetch resolves.
   */
  const renderRound = useCallback(
    (round: number, resumeTo: PlaybackStatus) => {
      if (renderFromCache(round)) return;
      if (chunkRounds === null) return;

      const token = ++seekTokenRef.current;
      transition("seeking");
      const { from } = chunkBoundsFor(round, chunkRounds, clampMax());
      ensureChunk(from)
        .then((chunk) => {
          if (token !== seekTokenRef.current) return;
          if (chunk === null && isLiveStatus(useSimulationStore.getState().status)) {
            blockLiveScrub();
            return;
          }
          renderFromCache(round);
          transition(resumeTo);
        })
        .catch((err: unknown) => {
          if (token !== seekTokenRef.current) return;
          logger.error("usePlaybackEngine.renderRound", err);
          toast.error(t("replay.errorLoad"));
          stopDriver();
          transition("error");
        });
    },
    [
      renderFromCache,
      chunkRounds,
      clampMax,
      ensureChunk,
      transition,
      stopDriver,
      blockLiveScrub,
      t,
    ],
  );

  const startDriver = useCallback(() => {
    stopDriver();
    const step = (ts: number) => {
      rafRef.current = requestAnimationFrame(step);
      if (statusRef.current !== "playing") return;
      if (lastTickRef.current !== null) {
        const dt = (ts - lastTickRef.current) / 1000;
        playheadRef.current += dt * BASE_RPS * speedRef.current;
      }
      lastTickRef.current = ts;

      const end = clampMax();
      const target = Math.min(Math.floor(playheadRef.current), end);

      if (finalRoundRef.current === null && target >= end) {
        // Live tail caught up: render arrivals straight from the WS frame —
        // never via REST (a chunk ending at the old tail would be invalidated
        // and refetched on EVERY new round). Keeps pace with the backend.
        playheadRef.current = end;
        const received = useSimulationStore.getState().receivedFrame;
        if (received !== null && received.round !== renderedRoundRef.current) {
          useSimulationStore.getState().updateFrame(received);
          renderedRoundRef.current = received.round;
        }
        return;
      }

      if (target !== renderedRoundRef.current) {
        if (!renderFromCache(target)) {
          // Chunk miss: suspend playback while the chunk downloads
          stopDriver();
          renderRound(target, "playing");
          return;
        }
      }
      if (target >= end && finalRoundRef.current !== null) {
        // Persisted end reached — stop
        stopDriver();
        playheadRef.current = end;
        transition("paused");
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [renderFromCache, renderRound, stopDriver, transition, clampMax]);

  // Resume the driver when an async chunk fetch restores "playing"
  useEffect(() => {
    if (status === "playing" && rafRef.current === null) {
      startDriver();
    }
  }, [status, startDriver]);

  const detach = useCallback(() => {
    if (useSimulationStore.getState().follow) {
      useSimulationStore.getState().setFollow(false);
    }
  }, []);

  const play = useCallback(() => {
    const current = statusRef.current;
    if (current !== "ready" && current !== "paused" && current !== "live") return;
    if (liveScrubBlockedRef.current) return;
    detach();
    const end = clampMax();
    if (renderedRoundRef.current >= end || current === "live") {
      // Play from the end (or from the live tail) restarts at round 0
      playheadRef.current = 0;
      renderedRoundRef.current = -1;
    }
    transition("playing");
    startDriver();
  }, [transition, startDriver, clampMax, detach]);

  const pause = useCallback(() => {
    if (statusRef.current !== "playing" && statusRef.current !== "seeking") return;
    seekTokenRef.current++;
    stopDriver();
    transition("paused");
  }, [stopDriver, transition]);

  const togglePlay = useCallback(() => {
    if (statusRef.current === "playing") {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const seek = useCallback(
    (round: number) => {
      if (statusRef.current === "idle" || statusRef.current === "loading") return;
      if (liveScrubBlockedRef.current) return;
      const target = Math.max(0, Math.min(Math.round(round), clampMax()));
      detach();
      playheadRef.current = target;
      const wasPlaying = statusRef.current === "playing";
      if (!wasPlaying) stopDriver();
      renderRound(target, wasPlaying ? "playing" : "paused");
    },
    [renderRound, stopDriver, clampMax, detach],
  );

  const stepBy = useCallback(
    (delta: number) => {
      seek(useSimulationStore.getState().currentRound + delta);
    },
    [seek],
  );

  const returnToLive = useCallback(() => {
    if (!isLiveStatus(useSimulationStore.getState().status)) return;
    seekTokenRef.current++;
    stopDriver();
    useSimulationStore.getState().setFollow(true);
    const received = useSimulationStore.getState().receivedFrame;
    if (received !== null) {
      useSimulationStore.getState().updateFrame(received);
      renderedRoundRef.current = received.round;
    }
    transition("live");
  }, [stopDriver, transition]);

  const goToEnd = useCallback(() => {
    if (isLiveStatus(useSimulationStore.getState().status)) {
      returnToLive();
    } else {
      seek(clampMax());
    }
  }, [returnToLive, seek, clampMax]);

  const setSpeed = useCallback((next: PlaybackSpeed) => {
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  const retry = useCallback(() => {
    setInitNonce((n) => n + 1);
  }, []);

  /** Shared finalize for a finished run whose frames were already received. */
  const finalizeFromStore = useCallback(() => {
    const state = useSimulationStore.getState();
    const final = state.finalRound ?? state.receivedRound;
    finalRoundRef.current = final;
    setFinalRound(final);
    if (state.finalRound === null) useSimulationStore.getState().setFinalRound(final);
    liveScrubBlockedRef.current = false;
    setLiveScrubBlocked(false);
    playheadRef.current = state.currentRound;
    renderedRoundRef.current = state.currentRound;
    transition("paused");
  }, [transition]);

  // Init: reset on run/network identity change, then branch on run liveness.
  // Cold-loaded finished runs probe availability + round bound with a single
  // ?round=last request and land "ready" AT the final round without rendering.
  // biome-ignore lint/correctness/useExhaustiveDependencies: init must rerun only on run/network identity, agentCount readiness, or explicit retry (initNonce) — the stable callbacks it uses are intentionally excluded
  useEffect(() => {
    if (agentCount === null) return;
    let cancelled = false;

    stopDriver();
    seekTokenRef.current++;
    chunksRef.current.clear();
    inflightRef.current.clear();
    playheadRef.current = 0;
    renderedRoundRef.current = -1;
    finalRoundRef.current = null;
    liveScrubBlockedRef.current = false;
    setLiveScrubBlocked(false);
    setFinalRound(null);
    transition("loading");

    const state = useSimulationStore.getState();

    if (isLiveStatus(state.status)) {
      // Live run: the WS renders while following; the engine stays passive.
      transition("live");
      return;
    }

    if (state.receivedRound > 0) {
      // Finished run whose frames flowed through this session (watched live or
      // REST fallback replay) — no probe needed.
      finalizeFromStore();
      applyAutoSpeed(finalRoundRef.current ?? state.receivedRound);
      return;
    }

    const init = async () => {
      try {
        const lastBuffer = await simulationsApi.getFrames(runId, networkId, { round: "last" });
        if (cancelled) return;
        if (lastBuffer === null) {
          transition("unavailable");
          return;
        }

        const final = readLastRoundHeader(lastBuffer);
        finalRoundRef.current = final;
        setFinalRound(final);
        useSimulationStore.getState().setFinalRound(final);
        applyAutoSpeed(final);

        // Land "ready" positioned at the end without pushing any frame: the
        // live view already shows the final state (WS or REST burst) and an
        // init render would fight it. Pressing play from the end restarts at 0.
        playheadRef.current = final;
        renderedRoundRef.current = final;
        transition("ready");

        // Warm the cache for the restart-at-0 that play() will trigger
        ensureChunk(0).catch((err: unknown) => {
          logger.error("usePlaybackEngine.prefetch", err);
        });
      } catch (err) {
        if (cancelled) return;
        logger.error("usePlaybackEngine.init", err);
        toast.error(t("replay.errorLoad"));
        transition("error");
      }
    };

    init();

    return () => {
      cancelled = true;
      stopDriver();
      chunksRef.current.clear();
      inflightRef.current.clear();
    };
  }, [runId, networkId, agentCount, initNonce]);

  // Live → finished transition while mounted: finalize in place (no probe when
  // frames were received; probe via retry-init when nothing arrived).
  useEffect(() => {
    if (agentCount === null) return;
    if (isLive) return;
    const current = statusRef.current;
    if (current !== "live" && current !== "playing" && current !== "paused") return;
    if (finalRoundRef.current !== null) return;

    const state = useSimulationStore.getState();
    if (state.receivedRound > 0) {
      const wasPlaying = current === "playing";
      finalizeFromStore();
      if (wasPlaying) transition("playing");
    } else {
      setInitNonce((n) => n + 1);
    }
  }, [isLive, agentCount, finalizeFromStore, transition]);

  return {
    status,
    isLive,
    follow,
    currentRound,
    receivedRound,
    finalRound,
    speed,
    isPlaying: status === "playing",
    liveScrubBlocked,
    play,
    pause,
    togglePlay,
    seek,
    stepBy,
    returnToLive,
    goToEnd,
    setSpeed,
    retry,
  };
}
