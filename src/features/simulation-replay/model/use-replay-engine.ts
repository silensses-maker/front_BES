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

export type ReplayStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "unavailable"
  | "error";

export type ReplaySpeed = 0.5 | 1 | 2 | 4;

export const REPLAY_SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 4];

/** Rounds per second at 1x speed. */
const BASE_RPS = 10;
/** Max raw chunks kept in memory (LRU). */
const MAX_CACHED_CHUNKS = 4;

export interface UseReplayEngineReturn {
  status: ReplayStatus;
  currentRound: number;
  finalRound: number | null;
  speed: ReplaySpeed;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (round: number) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  retry: () => void;
}

/**
 * Replay engine for persisted frames of a finished run. Fetches raw chunks via
 * REST (`GET .../frames?from&to`), merges one round per render on the main
 * thread (fresh PartitionMerger per call — the shared one is forward-only) and
 * pushes each rendered round into the simulation store, which repaints the
 * frozen canvas Final view.
 *
 * The caller must have seeded the store (topology + status "completed") before
 * `agentCount` becomes non-null; the engine only writes finalRound and frames.
 */
export function useReplayEngine(
  runId: string,
  networkId: string,
  agentCount: number | null,
): UseReplayEngineReturn {
  const { t } = useTranslation();

  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [currentRound, setCurrentRound] = useState(0);
  const [finalRound, setFinalRound] = useState<number | null>(null);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const [initNonce, setInitNonce] = useState(0);

  const statusRef = useRef<ReplayStatus>("idle");
  const speedRef = useRef<ReplaySpeed>(1);
  const finalRoundRef = useRef<number | null>(null);
  const playheadRef = useRef(0);
  const renderedRoundRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const seekTokenRef = useRef(0);
  const chunksRef = useRef(new Map<number, IndexedChunk>());
  const inflightRef = useRef(new Map<number, Promise<IndexedChunk | null>>());

  const chunkRounds = agentCount !== null ? chunkRoundsFor(agentCount) : null;

  const transition = useCallback((next: ReplayStatus) => {
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
      if (chunkRounds === null || finalRoundRef.current === null) return Promise.resolve(null);

      const to = Math.min(from + chunkRounds - 1, finalRoundRef.current);
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
    [runId, networkId, chunkRounds],
  );

  /** Merges and pushes `round` from an already-cached chunk. Returns false on cache miss. */
  const renderFromCache = useCallback(
    (round: number): boolean => {
      if (chunkRounds === null || finalRoundRef.current === null || agentCount === null) {
        return false;
      }
      const { from, to } = chunkBoundsFor(round, chunkRounds, finalRoundRef.current);
      const chunk = chunksRef.current.get(from);
      if (!chunk) return false;

      const frame = mergeRoundFromChunk(chunk, round, agentCount);
      if (frame !== null) {
        useSimulationStore.getState().updateFrame(frame);
      }
      renderedRoundRef.current = round;
      setCurrentRound(round);

      // Prefetch the next chunk when the playhead approaches this chunk's end
      const prefetchAt = to - Math.ceil(chunkRounds / 4);
      if (round >= prefetchAt && to < finalRoundRef.current) {
        ensureChunk(to + 1).catch((err: unknown) => {
          logger.error("useReplayEngine.prefetch", err);
        });
      }
      return true;
    },
    [agentCount, chunkRounds, ensureChunk],
  );

  /**
   * Renders `round`, fetching its chunk first if needed. `resumeTo` is the
   * status to restore once an async fetch resolves.
   */
  const renderRound = useCallback(
    (round: number, resumeTo: ReplayStatus) => {
      if (renderFromCache(round)) return;
      if (chunkRounds === null || finalRoundRef.current === null) return;

      const token = ++seekTokenRef.current;
      transition("seeking");
      const { from } = chunkBoundsFor(round, chunkRounds, finalRoundRef.current);
      ensureChunk(from)
        .then(() => {
          if (token !== seekTokenRef.current) return;
          renderFromCache(round);
          transition(resumeTo);
        })
        .catch((err: unknown) => {
          if (token !== seekTokenRef.current) return;
          logger.error("useReplayEngine.renderRound", err);
          toast.error(t("replay.errorLoad"));
          stopDriver();
          transition("error");
        });
    },
    [renderFromCache, chunkRounds, ensureChunk, transition, stopDriver, t],
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

      const final = finalRoundRef.current;
      if (final === null) return;
      const target = Math.min(Math.floor(playheadRef.current), final);
      if (target !== renderedRoundRef.current) {
        if (!renderFromCache(target)) {
          // Chunk miss: suspend playback while the chunk downloads
          stopDriver();
          renderRound(target, "playing");
          return;
        }
      }
      if (target >= final) {
        stopDriver();
        playheadRef.current = final;
        transition("paused");
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [renderFromCache, renderRound, stopDriver, transition]);

  // Resume the driver when an async chunk fetch restores "playing"
  useEffect(() => {
    if (status === "playing" && rafRef.current === null) {
      startDriver();
    }
  }, [status, startDriver]);

  const play = useCallback(() => {
    const current = statusRef.current;
    if (current !== "ready" && current !== "paused") return;
    const final = finalRoundRef.current;
    if (final !== null && renderedRoundRef.current >= final) {
      // Play from the end restarts at round 0
      playheadRef.current = 0;
      renderedRoundRef.current = -1;
    }
    transition("playing");
    startDriver();
  }, [transition, startDriver]);

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
      const final = finalRoundRef.current;
      if (final === null) return;
      const target = Math.max(0, Math.min(Math.round(round), final));
      playheadRef.current = target;
      const wasPlaying = statusRef.current === "playing";
      if (!wasPlaying) stopDriver();
      renderRound(target, wasPlaying ? "playing" : "paused");
    },
    [renderRound, stopDriver],
  );

  const setSpeed = useCallback((next: ReplaySpeed) => {
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  const retry = useCallback(() => {
    setInitNonce((n) => n + 1);
  }, []);

  // Init: probe availability + round bound with a single ?round=last request,
  // seed the canvas with the final frame, then land paused on round 0.
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
    setFinalRound(null);
    setCurrentRound(0);
    transition("loading");

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

        // Land "ready" positioned at the end without pushing any frame: the
        // live view already shows the final state (WS or REST burst) and an
        // init render would fight it. Pressing play from the end restarts at 0.
        playheadRef.current = final;
        renderedRoundRef.current = final;
        setCurrentRound(final);
        transition("ready");

        // Warm the cache for the restart-at-0 that play() will trigger
        ensureChunk(0).catch((err: unknown) => {
          logger.error("useReplayEngine.prefetch", err);
        });
      } catch (err) {
        if (cancelled) return;
        logger.error("useReplayEngine.init", err);
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

  return {
    status,
    currentRound,
    finalRound,
    speed,
    isPlaying: status === "playing",
    play,
    pause,
    togglePlay,
    seek,
    setSpeed,
    retry,
  };
}
