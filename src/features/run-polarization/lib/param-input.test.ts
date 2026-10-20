import { describe, expect, it } from "vitest";
import { readChartTheme } from "@/shared/lib/chart-theme";
import { ALIENATION_IDS, MEASURES } from "@/shared/lib/polarization";
import {
  alienationLabel,
  formatMeasureValue,
  formatParamValue,
  parseParamInput,
  rangeText,
} from "./param-input";
import { polarizationOption } from "./polarization-chart-option";

const [erAlpha, erK] = MEASURES.EstebanRay.params;
const [mecAlpha] = MEASURES.MEC.params;
if (erAlpha?.kind !== "number" || erK?.kind !== "optional-number" || mecAlpha?.kind !== "number") {
  throw new Error("unexpected registry specs");
}

describe("parseParamInput", () => {
  it("accepts in-range numbers, with a decimal comma too", () => {
    expect(parseParamInput(erAlpha, "1.2")).toEqual({ ok: true, value: 1.2 });
    expect(parseParamInput(erAlpha, " 0,5 ")).toEqual({ ok: true, value: 0.5 });
    expect(parseParamInput(mecAlpha, "12")).toEqual({ ok: true, value: 12 });
  });

  it("rejects text, empty required fields and out-of-range values", () => {
    expect(parseParamInput(erAlpha, "abc")).toEqual({ ok: false, reason: "number" });
    expect(parseParamInput(erAlpha, "")).toEqual({ ok: false, reason: "number" });
    expect(parseParamInput(erAlpha, "1.7")).toEqual({ ok: false, reason: "range" });
    expect(parseParamInput(erAlpha, "0")).toEqual({ ok: false, reason: "range" });
    expect(parseParamInput(erK, "-1")).toEqual({ ok: false, reason: "range" });
  });

  it("treats an empty optional K as automatic", () => {
    expect(parseParamInput(erK, "  ")).toEqual({ ok: true, value: null });
    expect(parseParamInput(erK, "2")).toEqual({ ok: true, value: 2 });
  });
});

describe("formatting", () => {
  it("formats parameter values, ranges and alienations", () => {
    expect(formatParamValue(null)).toBe("");
    expect(formatParamValue(undefined)).toBe("");
    expect(formatParamValue(0.8)).toBe("0.8");
    expect(rangeText(erAlpha)).toBe("(0, 1.6]");
    expect(rangeText(mecAlpha)).toBe("> 0");
    expect(rangeText(erK)).toBe("> 0");
    expect(ALIENATION_IDS.map(alienationLabel)).toEqual([
      "d",
      "d²",
      "d³",
      "d + d²",
      "d + 2d²",
      "eᵈ − 1",
      "e²ᵈ − 1",
    ]);
  });

  it("formats measure values with 4 decimals in the UI language", () => {
    expect(formatMeasureValue(0.123456, "en")).toBe("0.1235");
    expect(formatMeasureValue(0.5, "es")).toBe("0,5000");
    expect(formatMeasureValue(null, "en")).toBe("—");
    expect(formatMeasureValue(Number.NaN, "en")).toBe("—");
  });
});

describe("polarizationOption", () => {
  const theme = readChartTheme();
  const base = {
    points: [
      [0, 0.2],
      [1, null],
      [2, 0.6],
    ] as Array<[number, number | null]>,
    round: 2,
    seriesName: "BiPol",
    theme,
    formatValue: (v: number) => v.toFixed(2),
    formatTooltip: (round: number, v: number | null) => `r${round}:${v}`,
  };

  it("draws the series with gaps, the playhead and labelled thresholds", () => {
    const option = polarizationOption({
      ...base,
      thresholds: [
        { value: 0.4525, label: "medium" },
        { value: 0.6267, label: "high" },
      ],
    });
    const series = option.series[0];
    expect(series?.connectNulls).toBe(false);
    expect(series?.lineStyle.color).toBe(theme.polarization);
    expect(series?.markLine.data).toHaveLength(3);
    expect(series?.markLine.data[0]).toEqual({ xAxis: 2 });
    expect(series?.markLine.data[2]).toMatchObject({ yAxis: 0.6267, label: { formatter: "high" } });
    expect(option.grid.right).toBe(64);
    expect(option.yAxis.axisLabel.formatter?.(0.5)).toBe("0.50");
  });

  it("formats the axis tooltip from the hovered point", () => {
    const option = polarizationOption({ ...base, thresholds: [] });
    const formatter = option.tooltip.formatter as (params: unknown) => string;
    expect(formatter([{ value: [1, null] }])).toBe("r1:null");
    expect(formatter({ value: [2, 0.6] })).toBe("r2:0.6");
    expect(formatter([])).toBe("r2:null");
    expect(option.grid.right).toBe(18);
  });
});
