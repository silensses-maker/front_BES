import { describe, expect, it } from "vitest";
import { agentCsvRow, buildCsv, type CsvLabels, csvFileName, roundCsvRow } from "./csv";
import type { AgentRow, RoundRow } from "./table-datasets";

const LABELS: CsvLabels = {
  strategy: (v) => `estr-${v}`,
  effect: (v) => `efec-${v}`,
  speaking: "Hablando",
  silent: "En silencio",
  consensus: "Consenso",
  noConsensus: "Sin consenso",
};

describe("buildCsv", () => {
  it("joins with ; prefixed by the UTF-8 BOM", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a;b\n1;2");
  });

  it("quotes fields containing separator, quote or newline", () => {
    const csv = buildCsv(["x"], [['va;l"ue'], ["multi\nline"], ["plain"]]);
    expect(csv).toContain('"va;l""ue"');
    expect(csv).toContain('"multi\nline"');
    expect(csv).toContain("plain");
  });
});

describe("csvFileName", () => {
  it("builds the mockup pattern with optional network and round segments", () => {
    expect(csvFileName({ runId: "abc123", dataset: "agents", networkOrdinal: 3, round: 42 })).toBe(
      "silensess-abc123-red3-agentes-ronda42.csv",
    );
    expect(
      csvFileName({ runId: "abc123", dataset: "rounds", networkOrdinal: null, round: null }),
    ).toBe("silensess-abc123-rondas.csv");
    expect(
      csvFileName({ runId: "abc123", dataset: "networks", networkOrdinal: null, round: null }),
    ).toBe("silensess-abc123-redes.csv");
    expect(csvFileName({ runId: "", dataset: "rounds", networkOrdinal: null, round: null })).toBe(
      "silensess-run-rondas.csv",
    );
  });
});

describe("row serializers", () => {
  it("agent rows use 6-decimal raw values and localized labels", () => {
    const row: AgentRow = {
      index: 4,
      name: null,
      strategy: 2,
      effect: 1,
      publicBelief: 0.123456789,
      privateBelief: 0.5,
      divergence: 0.376543,
      speaking: true,
      degreeIn: 3,
      degreeOut: 1,
    };
    expect(agentCsvRow(row, LABELS)).toEqual([
      "4",
      "",
      "estr-2",
      "efec-1",
      "0.123457",
      "0.500000",
      "0.376543",
      "Hablando",
      "3",
      "1",
    ]);
  });

  it("round rows serialize participation as a 6-decimal fraction", () => {
    const row: RoundRow = {
      round: 9,
      meanPublic: 0.5,
      meanPrivate: 0.25,
      spread: 0.1,
      participation: 0.666666,
    };
    expect(roundCsvRow(row)).toEqual(["9", "0.500000", "0.250000", "0.100000", "0.666666"]);
  });
});
