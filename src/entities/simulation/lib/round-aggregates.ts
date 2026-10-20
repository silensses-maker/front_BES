import { computeRoundStats, type RoundStats } from "@/shared/lib/round-stats";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export interface RoundAggregate {
  meanPublic: number;
  meanPrivate: number;
  /** max − min of private beliefs — the run's "dispersión". */
  spread: number;
  /** Fraction of agents speaking this round, 0..1. */
  participation: number;
  /** Population variance of the public beliefs (σ² = (1/n) Σ (bᵢ − μ)², exact). */
  variancePublic: number;
  /** Population variance of the private beliefs. */
  variancePrivate: number;
}

/** Max agent series kept for the evolution chart (mockup: 50, uniform sample). */
export const MAX_SAMPLED_AGENTS = 50;

/** Per-agent series length that triggers thinning (memory cap for long runs). */
export const MAX_SERIES_POINTS = 1200;

/**
 * Statistics of a frame: the ones the frame worker attached (live / REST fallback), or computed
 * here for frames merged on the main thread (cold-load sweep).
 */
export function roundStatsOf(frame: MergedFrame): RoundStats {
  return (
    frame.stats ??
    computeRoundStats(frame.publicBelief, frame.privateBelief, frame.speaking, {
      // polarization replica (#129): remove with src/shared/lib/polarization + src/features/run-polarization
      fineHistograms: __POLARIZATION__,
    })
  );
}

export function toRoundAggregate(stats: RoundStats): RoundAggregate {
  return {
    meanPublic: stats.meanPublic,
    meanPrivate: stats.meanPrivate,
    spread: stats.spread,
    participation: stats.participation,
    variancePublic: stats.variancePublic,
    variancePrivate: stats.variancePrivate,
  };
}

export function computeRoundAggregate(frame: MergedFrame): RoundAggregate {
  return toRoundAggregate(roundStatsOf(frame));
}

/** Uniform sample of agent indices: 0, step, 2·step… (≤ maxSeries entries). */
export function sampleAgentIndices(
  agentCount: number,
  maxSeries: number = MAX_SAMPLED_AGENTS,
): number[] {
  if (agentCount <= 0) return [];
  const count = Math.min(agentCount, maxSeries);
  const step = agentCount <= maxSeries ? 1 : Math.floor(agentCount / maxSeries);
  const indices: number[] = [];
  for (let i = 0; i < count; i++) indices.push(i * step);
  return indices;
}

/** Halves a series by dropping every other point (memory cap, keeps endpoints). */
export function thinSeries(points: Array<[number, number]>): Array<[number, number]> {
  return points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
}
