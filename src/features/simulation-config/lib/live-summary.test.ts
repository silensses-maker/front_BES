import { describe, expect, it } from "vitest";
import type { GeneratedSimFormValues } from "../types/simulation-config.types";
import {
  buildAgentComposition,
  buildBiasComposition,
  formatNumber,
  isOverQuota,
  listValidationMessages,
  quotaMeterPct,
  UNLIMITED_METER_STUB,
} from "./live-summary";

function makeGen(overrides: Partial<GeneratedSimFormValues> = {}): GeneratedSimFormValues {
  return {
    networkType: "generated",
    numberOfAgents: 180,
    numberOfNetworks: 1,
    density: 3,
    iterationLimit: 100,
    stopThreshold: 0.01,
    seed: null,
    saveMode: 1,
    agentTypes: [
      { id: "a0", count: 157, silenceStrategy: 0, silenceEffect: 0 },
      { id: "a1", count: 23, silenceStrategy: 2, silenceEffect: 1 },
    ],
    biasTypes: [{ id: "b0", count: 1068, cognitiveBias: 1 }],
    ...overrides,
  };
}

describe("buildAgentComposition", () => {
  it("groups rows by strategy and computes pct over the row sum", () => {
    const entries = buildAgentComposition(makeGen());

    expect(entries).toEqual([
      { labelKey: "simulationConfig.strategyDegroot", count: 157, pct: 87.2 },
      { labelKey: "simulationConfig.strategyThreshold", count: 23, pct: 12.8 },
    ]);
  });

  it("merges rows sharing a strategy (different effects)", () => {
    const entries = buildAgentComposition(
      makeGen({
        agentTypes: [
          { id: "a0", count: 5, silenceStrategy: 0, silenceEffect: 0 },
          { id: "a1", count: 5, silenceStrategy: 0, silenceEffect: 1 },
        ],
      }),
    );

    expect(entries).toEqual([
      { labelKey: "simulationConfig.strategyDegroot", count: 10, pct: 100 },
    ]);
  });

  it("handles an empty row list", () => {
    expect(buildAgentComposition(makeGen({ agentTypes: [] }))).toEqual([]);
  });

  it("keeps zero-count rows as 0 / 0% entries without dividing by zero", () => {
    const entries = buildAgentComposition(
      makeGen({ agentTypes: [{ id: "a0", count: 0, silenceStrategy: 1, silenceEffect: 0 }] }),
    );

    expect(entries).toEqual([{ labelKey: "simulationConfig.strategyMajority", count: 0, pct: 0 }]);
  });
});

describe("buildBiasComposition", () => {
  it("maps bias groups to their label keys", () => {
    const entries = buildBiasComposition(
      makeGen({
        biasTypes: [
          { id: "b0", count: 30, cognitiveBias: 0 },
          { id: "b1", count: 70, cognitiveBias: 4 },
        ],
      }),
    );

    expect(entries).toEqual([
      { labelKey: "simulationConfig.biasNone", count: 30, pct: 30 },
      { labelKey: "simulationConfig.biasInsular", count: 70, pct: 70 },
    ]);
  });
});

describe("quotaMeterPct / isOverQuota", () => {
  it("computes the fill percentage against a finite limit", () => {
    expect(quotaMeterPct(180, 1000)).toBe(18);
  });

  it("clamps at 100 when over the limit", () => {
    expect(quotaMeterPct(2000, 1000)).toBe(100);
  });

  it("returns the 8% stub for unlimited quotas", () => {
    expect(quotaMeterPct(180, null)).toBe(UNLIMITED_METER_STUB);
    expect(quotaMeterPct(180, Number.POSITIVE_INFINITY)).toBe(UNLIMITED_METER_STUB);
  });

  it("isOverQuota is false for unlimited and true past a finite limit", () => {
    expect(isOverQuota(5000, null)).toBe(false);
    expect(isOverQuota(1001, 1000)).toBe(true);
    expect(isOverQuota(1000, 1000)).toBe(false);
  });
});

describe("listValidationMessages", () => {
  it("returns an empty list for a clean errors object", () => {
    expect(listValidationMessages({})).toEqual([]);
  });

  it("maps flags to keys with interpolation params in stable order", () => {
    const messages = listValidationMessages(
      {
        agentLimitExceeded: true,
        iterationLimitExceeded: true,
        agentCountMismatch: true,
        biasCountMismatch: true,
      },
      {
        requested: "1.800",
        limit: "1.000",
        iterationLimit: "1.000",
        actual: "157",
        expected: "180",
        bias: "1.068",
        maxEdges: "1.074",
      },
    );

    expect(messages).toEqual([
      {
        key: "simulationConfig.errorAgentLimit",
        params: { requested: "1.800", limit: "1.000" },
      },
      { key: "simulationConfig.errorIterationLimit", params: { limit: "1.000" } },
      {
        key: "simulationConfig.errorAgentCountMismatch",
        params: { actual: "157", expected: "180" },
      },
      {
        key: "simulationConfig.errorBiasMismatch",
        params: { bias: "1.068", maxEdges: "1.074" },
      },
    ]);
  });

  it("covers the custom-path flags", () => {
    const keys = listValidationMessages({
      customNetworkNameEmpty: true,
      customNoAgents: true,
      customNoEdges: true,
      customEdgeDuplicate: true,
    }).map((m) => m.key);

    expect(keys).toEqual([
      "simulationConfig.errorCustomNetworkNameEmpty",
      "simulationConfig.errorCustomNoAgents",
      "simulationConfig.errorCustomNoEdges",
      "simulationConfig.errorCustomEdgeDuplicate",
    ]);
  });
});

describe("formatNumber", () => {
  it("localizes with grouping per language", () => {
    // CLDR Spanish only groups from 5 digits (minimumGroupingDigits: 2)
    expect(formatNumber(10680, "es")).toBe("10.680");
    expect(formatNumber(1068, "en")).toBe("1,068");
  });

  it("renders ∞ for non-finite values", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY, "es")).toBe("∞");
  });
});
