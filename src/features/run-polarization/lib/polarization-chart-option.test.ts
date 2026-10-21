import { describe, expect, it } from "vitest";
import { readChartTheme } from "@/shared/lib/chart-theme";
import { CONSTANT_LEVEL, normalizePoints, normalizeValue, valueRange } from "./normalize";
import {
  type ChartSeriesInput,
  type PolarizationChartInput,
  polarizationOption,
  tooltipTarget,
} from "./polarization-chart-option";
import {
  escapeHtml,
  polarizationTooltip,
  type TooltipFormat,
  tooltipHtml,
} from "./polarization-tooltip";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const theme = readChartTheme();

function line(name: string, color: string, points: Array<[number, number | null]>) {
  return { name, color, points, range: valueRange(points) } satisfies ChartSeriesInput;
}

const BIPOL = line("BiPol", theme.series[0] as string, [
  [0, 0.2],
  [1, null],
  [2, 0.6],
]);
const MEC = line("MEC · k=5 · private", theme.series[1] as string, [
  [0, 4],
  [1, 6],
  [2, 8],
]);

const base: PolarizationChartInput = {
  series: [BIPOL],
  compare: false,
  round: 2,
  thresholds: [],
  axisMode: "values",
  theme,
  formatValue: (v: number) => v.toFixed(2),
  formatTooltip: (round: number, indices: number[]) => `r${round}:${indices.join(",")}`,
};

const THRESHOLDS = [
  { value: 0.4525, label: "medium" },
  { value: 0.6267, label: "high" },
];

// ─── Normalization ───────────────────────────────────────────────────────────

describe("normalization (shape)", () => {
  it("rescales each series to [0, 1] by its own min–max, keeping gaps", () => {
    const range = valueRange(MEC.points);
    expect(range).toEqual({ min: 4, max: 8 });
    expect(normalizePoints(MEC.points, range)).toEqual([
      [0, 0],
      [1, 0.5],
      [2, 1],
    ]);
    expect(normalizePoints(BIPOL.points, BIPOL.range)).toEqual([
      [0, 0],
      [1, null],
      [2, 1],
    ]);
  });

  it("draws a constant series flat at the middle (a single value too)", () => {
    const flat = valueRange([
      [0, 0.3],
      [1, 0.3],
    ]);
    expect(normalizeValue(0.3, flat)).toBe(CONSTANT_LEVEL);
    expect(CONSTANT_LEVEL).toBe(0.5);
    expect(normalizeValue(7, valueRange([[0, 7]]))).toBe(0.5);
  });

  it("has no range without finite values, and no value without a range", () => {
    expect(valueRange([])).toBeNull();
    expect(
      valueRange([
        [0, null],
        [1, Number.NaN],
      ]),
    ).toBeNull();
    expect(normalizeValue(0.4, null)).toBeNull();
    expect(normalizeValue(null, { min: 0, max: 1 })).toBeNull();
    expect(normalizeValue(Number.POSITIVE_INFINITY, { min: 0, max: 1 })).toBeNull();
  });
});

// ─── Chart option ────────────────────────────────────────────────────────────

describe("polarizationOption — one series (the view before the comparison)", () => {
  it("draws the series with gaps, the playhead and labelled thresholds, without a legend", () => {
    const option = polarizationOption({ ...base, thresholds: THRESHOLDS });
    const series = option.series[0] as {
      connectNulls: boolean;
      lineStyle: { color: string };
      markLine: { data: unknown[] };
    };
    expect(option.series).toHaveLength(1);
    expect(series.connectNulls).toBe(false);
    expect(series.lineStyle.color).toBe(theme.polarization);
    expect(series.markLine.data).toHaveLength(3);
    expect(series.markLine.data[0]).toEqual({ xAxis: 2 });
    expect(series.markLine.data[2]).toMatchObject({ yAxis: 0.6267, label: { formatter: "high" } });
    expect(option.grid.right).toBe(64);
    expect(option.grid.top).toBe(10);
    expect(option).not.toHaveProperty("legend");
    expect(option.yAxis.axisLabel.formatter?.(0.5)).toBe("0.50");
    expect(option.yAxis.max).toBeUndefined();
  });

  it("ignores the normalized mode (one series is always on its real axis)", () => {
    const option = polarizationOption({ ...base, axisMode: "normalized" });
    expect(option.series[0]?.data).toEqual(BIPOL.points);
    expect(option.yAxis.max).toBeUndefined();
    expect(option.grid.right).toBe(18);
  });

  it("formats the axis tooltip from the hovered round", () => {
    const formatter = polarizationOption(base).tooltip.formatter as (params: unknown) => string;
    expect(formatter([{ axisValue: 1, seriesIndex: 0, value: [1, null] }])).toBe("r1:0");
    expect(formatter({ value: [2, 0.6], seriesIndex: 0 })).toBe("r2:0");
    expect(formatter([])).toBe("r2:");
  });
});

describe("polarizationOption — compared series", () => {
  const compared: PolarizationChartInput = { ...base, series: [BIPOL, MEC], compare: true };

  it("draws one line per series in its colour, a legend, the playhead, and no thresholds", () => {
    const option = polarizationOption({ ...compared, thresholds: THRESHOLDS });
    expect(option.series).toHaveLength(3);
    const [first, second, playhead] = option.series as Array<{
      name?: string;
      data: unknown[];
      lineStyle?: { color: string };
      markLine?: { data: unknown[] };
    }>;
    expect(first?.lineStyle?.color).toBe(theme.series[0]);
    expect(second?.lineStyle?.color).toBe(theme.series[1]);
    expect(first?.markLine).toBeUndefined();
    expect(playhead?.data).toEqual([]);
    expect(playhead?.markLine?.data).toEqual([{ xAxis: 2 }]);
    expect(option.legend).toMatchObject({
      data: ["BiPol", "MEC · k=5 · private"],
      selectedMode: false,
      type: "scroll",
    });
    expect(option.grid).toMatchObject({ top: 22, right: 18 });
    expect(second?.data).toEqual(MEC.points);
  });

  it("normalizes every series to [0, 1] on the normalized axis", () => {
    const option = polarizationOption({ ...compared, axisMode: "normalized" });
    expect(option.yAxis).toMatchObject({ min: 0, max: 1 });
    expect(option.series[1]?.data).toEqual([
      [0, 0],
      [1, 0.5],
      [2, 1],
    ]);
  });

  it("an empty comparison still draws the axes and the playhead", () => {
    const option = polarizationOption({ ...compared, series: [] });
    expect(option.series).toHaveLength(1);
    expect(option.legend).toMatchObject({ data: [] });
  });

  it("passes the series shown at the hovered round to the tooltip", () => {
    const formatter = polarizationOption(compared).tooltip.formatter as (params: unknown) => string;
    expect(
      formatter([
        { axisValue: 1, seriesIndex: 0 },
        { axisValue: 1, seriesIndex: 1 },
        { axisValue: 1, seriesIndex: 2 },
      ]),
    ).toBe("r1:0,1");
  });
});

describe("tooltipTarget", () => {
  it("reads the round from axisValue, else the point, else the playhead", () => {
    expect(tooltipTarget([{ axisValue: 4, seriesIndex: 1 }], 0, 2)).toEqual({
      round: 4,
      indices: [1],
    });
    expect(tooltipTarget([{ value: [3, 0.2], seriesIndex: 0 }], 0, 2)).toEqual({
      round: 3,
      indices: [0],
    });
    expect(tooltipTarget([null, "x", { seriesIndex: -1 }, { seriesIndex: "0" }], 7, 2)).toEqual({
      round: 7,
      indices: [],
    });
    expect(tooltipTarget(undefined, 5, 1)).toEqual({ round: 5, indices: [] });
  });
});

// ─── Tooltip HTML ────────────────────────────────────────────────────────────

describe("tooltipHtml", () => {
  it("lists one row per series with its swatch, bold value and details", () => {
    const html = tooltipHtml("Round 3", [
      { color: "rgb(1, 2, 3)", name: "MEC", value: "0.50", details: ["value 4.0000", "high"] },
      { color: null, name: "BiPol", value: "0.2000", details: [] },
    ]);
    expect(html).toBe(
      'Round 3<br/><span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:rgb(1, 2, 3)"></span>MEC: <b>0.50</b> · value 4.0000 · high<br/>BiPol: <b>0.2000</b>',
    );
  });

  it("escapes names and values (they reach ECharts as HTML)", () => {
    expect(escapeHtml(`<b>"Esteban & Ray's"</b>`)).toBe(
      "&lt;b&gt;&quot;Esteban &amp; Ray&#39;s&quot;&lt;/b&gt;",
    );
    expect(tooltipHtml("<r>", [{ color: null, name: "a<b", value: "1", details: ["x>y"] }])).toBe(
      "&lt;r&gt;<br/>a&lt;b: <b>1</b> · x&gt;y",
    );
  });
});

describe("polarizationTooltip", () => {
  const format: TooltipFormat = {
    lang: "en",
    level: (level) => `L:${level}`,
    realValue: (value) => `value ${value}`,
    normalized: "Normalized (shape)",
  };
  const mec = { name: "MEC", color: "c1", value: 6, level: null, range: { min: 4, max: 8 } };
  const bipol = { name: "BiPol", color: "c0", value: 0.6, level: "high", range: null };

  it("one series: its name, value and level, without a swatch (as before the comparison)", () => {
    expect(
      polarizationTooltip("Round 2", [bipol], { compare: false, axisMode: "normalized" }, format),
    ).toBe("Round 2<br/>BiPol: <b>0.6000</b> · L:high");
  });

  it("compared series on the real axis: a swatch, the value and the level of each", () => {
    const html = polarizationTooltip(
      "Round 2",
      [bipol, { ...mec, value: null, level: "low" }],
      { compare: true, axisMode: "values" },
      format,
    );
    expect(html).toContain("background-color:c0");
    expect(html).toContain("BiPol: <b>0.6000</b> · L:high");
    // No value at that round: no level either
    expect(html.endsWith("MEC: <b>—</b>")).toBe(true);
    expect(html).not.toContain("L:low");
  });

  it("normalized: the shape value in bold, then the real value and the level", () => {
    const html = polarizationTooltip(
      "Round 1",
      [mec, { ...bipol, range: { min: 0.6, max: 0.6 } }],
      { compare: true, axisMode: "normalized" },
      format,
    );
    expect(html.startsWith("Round 1 · Normalized (shape)<br/>")).toBe(true);
    expect(html).toContain("MEC: <b>0.50</b> · value 6.0000");
    // A constant series sits at the middle
    expect(html).toContain("BiPol: <b>0.50</b> · value 0.6000 · L:high");
  });
});
