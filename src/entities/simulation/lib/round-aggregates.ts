import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export interface RoundAggregate {
  meanPublic: number;
  meanPrivate: number;
  /** max − min of private beliefs — the run's "dispersión". */
  spread: number;
  /** Fraction of agents speaking this round, 0..1. */
  participation: number;
}

/** Max agent series kept for the evolution chart (mockup: 50, uniform sample). */
export const MAX_SAMPLED_AGENTS = 50;

/** Per-agent series length that triggers thinning (memory cap for long runs). */
export const MAX_SERIES_POINTS = 1200;

export function computeRoundAggregate(frame: MergedFrame): RoundAggregate {
  const len = frame.publicBelief.length;
  if (len === 0) {
    return { meanPublic: 0, meanPrivate: 0, spread: 0, participation: 0 };
  }
  let sumPublic = 0;
  let sumPrivate = 0;
  let speaking = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < len; i++) {
    const pub = frame.publicBelief[i] ?? 0;
    const priv = frame.privateBelief[i] ?? 0;
    sumPublic += pub;
    sumPrivate += priv;
    speaking += frame.speaking[i] ?? 0;
    if (priv < min) min = priv;
    if (priv > max) max = priv;
  }
  return {
    meanPublic: sumPublic / len,
    meanPrivate: sumPrivate / len,
    spread: max - min,
    participation: speaking / len,
  };
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
