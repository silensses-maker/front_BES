import { describe, expect, it } from "vitest";
import type { RoundAggregate } from "@/entities/simulation";
import { detectRoundEvents, findAdjacentEvent, findNearbyEvent } from "./round-events";

function agg(
  meanPublic: number,
  spread: number,
  participation: number,
  meanPrivate = meanPublic,
): RoundAggregate {
  return { meanPublic, meanPrivate, spread, participation };
}

// Baseline round 0: spread 0.8, full participation, mean 0.5
const BASE = agg(0.5, 0.8, 1);

describe("detectRoundEvents", () => {
  it("returns no events with fewer than two defined rounds", () => {
    expect(detectRoundEvents([BASE], 0, null)).toEqual([]);
    expect(detectRoundEvents([], 10, null)).toEqual([]);
  });

  it("finds the biggest mean shift round", () => {
    const aggregates = [BASE, agg(0.52, 0.8, 1), agg(0.7, 0.8, 1), agg(0.71, 0.8, 1)];
    const events = detectRoundEvents(aggregates, 3, null);
    const shift = events.find((e) => e.labelKey === "runView.eventMeanShift");
    expect(shift?.round).toBe(2);
    expect(shift?.kind).toBe("cambio");
  });

  it("finds the first round where spread halves vs the baseline", () => {
    const aggregates = [BASE, agg(0.5, 0.6, 1), agg(0.5, 0.39, 1), agg(0.5, 0.2, 1)];
    const events = detectRoundEvents(aggregates, 3, null);
    const halved = events.find((e) => e.labelKey === "runView.eventSpreadHalved");
    expect(halved?.round).toBe(2);
  });

  it("finds low-participation and minimum-participation rounds", () => {
    const aggregates = [BASE, agg(0.5, 0.8, 0.7), agg(0.5, 0.8, 0.55), agg(0.5, 0.8, 0.41)];
    const events = detectRoundEvents(aggregates, 3, null);
    const low = events.find((e) => e.labelKey === "runView.eventLowParticipation");
    const min = events.find((e) => e.labelKey === "runView.eventMinParticipation");
    expect(low?.round).toBe(2);
    expect(low?.kind).toBe("silencio");
    expect(min?.round).toBe(3);
    expect(min?.params).toEqual({ pct: 41 });
  });

  it("adds the final event with the consensus verdict", () => {
    const aggregates = [BASE, agg(0.5, 0.4, 1), agg(0.5, 0.01, 1)];
    const events = detectRoundEvents(aggregates, 2, { finalRound: 2, consensus: true });
    const fin = events.find((e) => e.kind === "fin");
    expect(fin?.round).toBe(2);
    expect(fin?.labelKey).toBe("runView.eventConsensus");

    const noCons = detectRoundEvents(aggregates, 2, { finalRound: 2, consensus: false });
    expect(noCons.find((e) => e.kind === "fin")?.labelKey).toBe("runView.eventNoConsensus");
  });

  it("omits the final event beyond the received prefix and dedups by round", () => {
    const aggregates = [BASE, agg(0.9, 0.3, 0.5, 0.9)];
    // Round 1 is simultaneously: biggest shift, spread halved, low participation
    const events = detectRoundEvents(aggregates, 1, { finalRound: 5, consensus: true });
    expect(events).toHaveLength(1);
    expect(events[0]?.round).toBe(1);
    expect(events.find((e) => e.kind === "fin")).toBeUndefined();
  });

  it("skips undefined rounds (sparse buffer) using the previous defined round", () => {
    const aggregates: Array<RoundAggregate | undefined> = [
      BASE,
      undefined,
      agg(0.6, 0.8, 1),
      undefined,
      agg(0.61, 0.8, 1),
    ];
    const events = detectRoundEvents(aggregates, 4, null);
    expect(events.find((e) => e.labelKey === "runView.eventMeanShift")?.round).toBe(2);
  });
});

describe("findNearbyEvent / findAdjacentEvent", () => {
  const events = detectRoundEvents(
    [BASE, agg(0.9, 0.8, 1), agg(0.9, 0.3, 1), agg(0.9, 0.01, 1)],
    3,
    { finalRound: 3, consensus: true },
  );
  // events: round 1 (cambio: mayor salto), round 2 (dispersión a la mitad), round 3 (fin)

  it("finds an event within tolerance and null far away", () => {
    expect(events.map((e) => e.round)).toEqual([1, 2, 3]);
    expect(findNearbyEvent(events, 1, 90)?.round).toBe(1);
    expect(findNearbyEvent(events, 50, 900)).toBeNull();
  });

  it("navigates to the adjacent event in either direction", () => {
    expect(findAdjacentEvent(events, 1, 1)?.round).toBe(2);
    expect(findAdjacentEvent(events, 3, -1)?.round).toBe(2);
    expect(findAdjacentEvent(events, 3, 1)).toBeNull();
    expect(findAdjacentEvent(events, 1, -1)).toBeNull();
  });
});
