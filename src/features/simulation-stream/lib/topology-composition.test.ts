import { describe, expect, it } from "vitest";
import type { TopologyAgent } from "@/shared/api/backend";
import { compositionBy } from "./topology-composition";

function agent(strategy: number, effect: number): TopologyAgent {
  return {
    index: 0,
    name: null,
    initialBelief: 0.5,
    toleranceRadius: 0.1,
    toleranceOffset: 0,
    silenceStrategy: strategy as TopologyAgent["silenceStrategy"],
    silenceEffect: effect as TopologyAgent["silenceEffect"],
  };
}

describe("compositionBy", () => {
  it("groups by strategy sorted by enum value with percentages", () => {
    const agents = [agent(2, 0), agent(0, 0), agent(0, 1), agent(2, 1)];
    expect(compositionBy(agents, "silenceStrategy")).toEqual([
      { value: 0, count: 2, pct: 50 },
      { value: 2, count: 2, pct: 50 },
    ]);
  });

  it("groups by effect with one-decimal percentages", () => {
    const agents = [agent(0, 0), agent(0, 1), agent(0, 1)];
    expect(compositionBy(agents, "silenceEffect")).toEqual([
      { value: 0, count: 1, pct: 33.3 },
      { value: 1, count: 2, pct: 66.7 },
    ]);
  });

  it("returns empty for no agents", () => {
    expect(compositionBy([], "silenceStrategy")).toEqual([]);
  });
});
