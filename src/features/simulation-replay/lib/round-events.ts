import type { RoundAggregate } from "@/entities/simulation";

export type RoundEventKind = "cambio" | "silencio" | "fin";

export interface RoundEvent {
  round: number;
  kind: RoundEventKind;
  /** i18n key under runView.* — resolved by the consumer. */
  labelKey: string;
  params?: Record<string, string | number>;
}

/** Participation threshold for the "few agents speaking" event. */
const LOW_PARTICIPATION = 0.6;

export interface RunEnd {
  finalRound: number;
  /** null = finished but verdict unknown (WS consensus not received). */
  consensus: boolean | null;
}

/**
 * Client-side event detection over the received prefix of the per-round
 * aggregates (mockup: cambio/silencio/fin ticks). Works on the sparse buffer —
 * missing rounds are skipped; delta-based events compare against the previous
 * DEFINED round. One event per round (first detected wins), ascending order.
 *
 * `end` is non-null only when the run finished; it contributes the final
 * "Convergencia · consenso" / "Última ronda · sin consenso" event.
 */
export function detectRoundEvents(
  aggregates: ReadonlyArray<RoundAggregate | undefined>,
  upTo: number,
  end: RunEnd | null,
): RoundEvent[] {
  const events: RoundEvent[] = [];
  const limit = Math.min(upTo, aggregates.length - 1);

  let baseline: RoundAggregate | null = null;
  let prev: RoundAggregate | null = null;

  let biggestShiftRound = -1;
  let biggestShift = 0;
  let spreadHalvedRound = -1;
  let lowParticipationRound = -1;
  let minParticipation = Number.POSITIVE_INFINITY;
  let minParticipationRound = -1;

  for (let t = 0; t <= limit; t++) {
    const agg = aggregates[t];
    if (agg === undefined) continue;
    if (baseline === null) {
      baseline = agg;
      prev = agg;
      continue;
    }

    const shift = Math.abs(agg.meanPublic - (prev ?? agg).meanPublic);
    if (shift > biggestShift) {
      biggestShift = shift;
      biggestShiftRound = t;
    }
    if (spreadHalvedRound === -1 && agg.spread <= baseline.spread / 2) {
      spreadHalvedRound = t;
    }
    if (lowParticipationRound === -1 && agg.participation < LOW_PARTICIPATION) {
      lowParticipationRound = t;
    }
    if (agg.participation < minParticipation) {
      minParticipation = agg.participation;
      minParticipationRound = t;
    }
    prev = agg;
  }

  if (biggestShiftRound > 0) {
    events.push({ round: biggestShiftRound, kind: "cambio", labelKey: "runView.eventMeanShift" });
  }
  if (spreadHalvedRound > 0) {
    events.push({
      round: spreadHalvedRound,
      kind: "cambio",
      labelKey: "runView.eventSpreadHalved",
    });
  }
  if (lowParticipationRound > 0) {
    events.push({
      round: lowParticipationRound,
      kind: "silencio",
      labelKey: "runView.eventLowParticipation",
    });
  }
  if (minParticipationRound > 0) {
    events.push({
      round: minParticipationRound,
      kind: "silencio",
      labelKey: "runView.eventMinParticipation",
      params: { pct: Math.round(minParticipation * 100) },
    });
  }
  if (end !== null && end.finalRound <= upTo) {
    events.push({
      round: end.finalRound,
      kind: "fin",
      labelKey: end.consensus ? "runView.eventConsensus" : "runView.eventNoConsensus",
    });
  }

  // One event per round, first detected wins; ascending by round.
  const seen = new Set<number>();
  return events
    .sort((a, b) => a.round - b.round)
    .filter((e) => {
      if (seen.has(e.round)) return false;
      seen.add(e.round);
      return true;
    });
}

/** Nearest event within tolerance of `round` (hover affordance, mockup R/90). */
export function findNearbyEvent(
  events: RoundEvent[],
  round: number,
  totalRounds: number,
): RoundEvent | null {
  const tolerance = Math.max(1, Math.round(totalRounds / 90));
  return events.find((e) => Math.abs(e.round - round) <= tolerance) ?? null;
}

/** Next event strictly after `round` (dir=1) or before it (dir=-1). */
export function findAdjacentEvent(
  events: RoundEvent[],
  round: number,
  dir: 1 | -1,
): RoundEvent | null {
  if (dir > 0) return events.find((e) => e.round > round) ?? null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && event.round < round) return event;
  }
  return null;
}
