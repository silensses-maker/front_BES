import { describe, expect, it } from "vitest";
import { readChartTheme } from "@/shared/lib/chart-theme";
import { CONSTANT_LEVEL, normalizePoints, normalizeValue, valueRange } from "./normalize";
import {
  type ChartSeriesInput,
  LEGEND_MAX_SERIES,
  type PolarizationChartInput,
  polarizationOption,
  tooltipTarget,
} from "./polarization-chart-option";
import {
  escapeHtml,
  lineSampleHtml,
  polarizationTooltip,
  type TooltipFormat,
  tooltipHtml,
} from "./polarization-tooltip";
import { type LineDash, MARKER_SIZE, slotStyle } from "./series-style";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const theme = readChartTheme();

function line(name: string, slot: number, points: Array<[number, number | null]>) {
  const style = slotStyle(slot);
  return {
    name,
    color: theme.series[style.colorIndex] as string,
    dash: style.dash,
    slot,
    points,
    range: valueRange(points),
  } satisfies ChartSeriesInput;
}

const BIPOL = line("BiPol", 0, [
  [0, 0.2],
  [1, null],
  [2, 0.6],
]);
const MEC = line("MEC · k=5 · private", 1, [
  [0, 4],
  [1, 6],
  [2, 8],
]);

/** A line of 200 rounds (every 5th one a gap) in slot `slot`. */
function longLine(slot: number) {
  const points: Array<[number, number | null]> = Array.from({ length: 200 }, (_, round) => [
    round,
    round % 5 === 4 ? null : round / 200,
  ]);
  return line(`S${slot}`, slot, points);
}

interface DrawnSeries {
  name?: string;
  type: string;
  data: Array<[number, number | null]>;
  symbol?: string;
  symbolSize?: number;
  silent?: boolean;
  itemStyle?: { color: string };
  lineStyle?: { color: string; width: number; type: unknown; cap: string };
  markLine?: { data: unknown[] };
}

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

describe("polarizationOption — line styles, markers and legend (up to 10 series)", () => {
  const ten = Array.from({ length: 10 }, (_, slot) => longLine(slot));
  const option = polarizationOption({ ...base, series: ten, compare: true });
  const drawn = option.series as DrawnSeries[];
  const lines = drawn.filter((series) => series.name !== undefined);
  const markers = drawn.filter((series) => series.type === "scatter");

  it("draws each slot in its colour and line style: solid 0–3, dashed 4–7, dotted 8–9", () => {
    expect(lines.map((series) => series.lineStyle?.type)).toEqual([
      "solid",
      "solid",
      "solid",
      "solid",
      [6, 3],
      [6, 3],
      [6, 3],
      [6, 3],
      [0.5, 4],
      [0.5, 4],
    ]);
    expect(lines.map((series) => series.lineStyle?.cap)).toEqual([
      ...Array(8).fill("butt"),
      "round",
      "round",
    ]);
    const palette = theme.series;
    expect(lines.map((series) => series.lineStyle?.color)).toEqual([
      ...palette,
      ...palette,
      palette[0],
      palette[1],
    ]);
    expect(lines.every((series) => series.lineStyle?.width === 2)).toBe(true);
    // The hovered point shows the line's marker (solid lines keep the default circle)
    expect(lines.map((series) => series.symbol)).toEqual([
      ...Array(4).fill(undefined),
      ...Array(4).fill("triangle"),
      "diamond",
      "diamond",
    ]);
  });

  it("adds a few silent markers to the dashed and dotted lines only, after the playhead", () => {
    expect(drawn).toHaveLength(10 + 1 + 6);
    expect(drawn[10]?.markLine?.data).toEqual([{ xAxis: 2 }]);
    expect(markers).toHaveLength(6);
    expect(drawn.slice(11)).toEqual(markers);
    for (const [index, series] of markers.entries()) {
      const source = ten[4 + index] as ChartSeriesInput;
      expect(series.symbol).toBe(index < 4 ? "triangle" : "diamond");
      expect(series.symbolSize).toBe(MARKER_SIZE);
      expect(series.silent).toBe(true);
      expect(series.itemStyle?.color).toBe(source.color);
      // Sparse: a handful of the line's points, never on a gap
      expect(series.data.length).toBeGreaterThanOrEqual(3);
      expect(series.data.length).toBeLessThanOrEqual(12);
      for (const point of series.data) {
        expect(source.points).toContainEqual(point);
        expect(point[1]).not.toBeNull();
      }
    }
    // Staggered: no two marked lines put their first marker on the same round
    expect(new Set(markers.map((series) => series.data[0]?.[0])).size).toBe(6);
    // The tooltip ignores them
    const formatter = option.tooltip.formatter as (params: unknown) => string;
    expect(
      formatter([
        { axisValue: 3, seriesIndex: 4 },
        { axisValue: 3, seriesIndex: 12 },
      ]),
    ).toBe("r3:4");
  });

  it("markers follow the normalized axis", () => {
    const normalized = polarizationOption({
      ...base,
      series: [longLine(0), longLine(4)],
      compare: true,
      axisMode: "normalized",
    });
    const marker = (normalized.series as DrawnSeries[]).find((s) => s.type === "scatter");
    const values = marker?.data.map((point) => point[1] as number) ?? [];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(Math.max(...values)).toBeGreaterThan(0.5);
  });

  it("draws the legend up to LEGEND_MAX_SERIES, with line icons in each series' dash", () => {
    expect(LEGEND_MAX_SERIES).toBe(4);
    const four = polarizationOption({
      ...base,
      series: [longLine(0), longLine(5), longLine(9), longLine(2)],
      compare: true,
    });
    expect(four.legend).toMatchObject({
      itemWidth: 22,
      itemHeight: 8,
      // The symbol ECharts draws in the middle of a line icon is hidden: it would cover the dash
      itemStyle: { opacity: 0 },
      data: ["S0", "S5", "S9", "S2"],
    });
    // No fixed icon: ECharts draws each line series' icon from its line style (dash, cap)
    expect(four.legend).not.toHaveProperty("icon");
    expect(four.legend).not.toHaveProperty("lineStyle");
    expect(four.grid.top).toBe(22);
    // More series: no legend (the chips are the key), the chart gets its height back
    expect(option).not.toHaveProperty("legend");
    expect(option.grid.top).toBe(10);
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
  it("lists one row per series with its line sample, bold value and details", () => {
    const html = tooltipHtml("Round 3", [
      {
        color: "rgb(1, 2, 3)",
        dash: "dashed",
        name: "MEC",
        value: "0.50",
        details: ["value 4.0000", "high"],
      },
      { color: null, name: "BiPol", value: "0.2000", details: [] },
    ]);
    expect(html).toBe(
      `Round 3<br/>${lineSampleHtml("rgb(1, 2, 3)", "dashed")}MEC: <b>0.50</b> · value 4.0000 · high<br/>BiPol: <b>0.2000</b>`,
    );
  });

  it("draws the sample as the chart draws the line: colour and dash, decorative", () => {
    const solid = lineSampleHtml("rgb(1, 2, 3)", "solid");
    expect(solid).toBe(
      '<svg aria-hidden="true" focusable="false" width="18" height="8" viewBox="0 0 18 8" style="display:inline-block;vertical-align:middle;margin:-2px 5px 0 0"><line x1="1" y1="4" x2="17" y2="4" stroke="rgb(1, 2, 3)" stroke-width="2" stroke-linecap="butt"/></svg>',
    );
    expect(lineSampleHtml("red", "dashed")).toContain(
      'stroke="red" stroke-width="2" stroke-dasharray="6 3" stroke-linecap="butt"/></svg>',
    );
    expect(lineSampleHtml("red", "dotted")).toContain(
      'stroke-dasharray="0.5 4" stroke-linecap="round"/></svg>',
    );
    // A row without a dash (older callers) draws a solid sample
    expect(tooltipHtml("r", [{ color: "red", name: "a", value: "1", details: [] }])).toContain(
      lineSampleHtml("red", "solid"),
    );
  });

  it("escapes the sample's colour too", () => {
    const html = lineSampleHtml('red" onload="alert(1)', "dotted");
    expect(html).not.toContain('" onload="');
    expect(html).toContain('stroke="red&quot; onload=&quot;alert(1)"');
    expect(html).not.toContain("<script");
    expect(lineSampleHtml("<script>", "solid")).toContain('stroke="&lt;script&gt;"');
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
  const mec = {
    name: "MEC",
    color: "c1",
    dash: "dotted" as LineDash,
    value: 6,
    level: null,
    range: { min: 4, max: 8 },
  };
  const bipol = {
    name: "BiPol",
    color: "c0",
    dash: "solid" as LineDash,
    value: 0.6,
    level: "high",
    range: null,
  };

  it("one series: its name, value and level, without a swatch (as before the comparison)", () => {
    expect(
      polarizationTooltip("Round 2", [bipol], { compare: false, axisMode: "normalized" }, format),
    ).toBe("Round 2<br/>BiPol: <b>0.6000</b> · L:high");
  });

  it("compared series on the real axis: a line sample, the value and the level of each", () => {
    const html = polarizationTooltip(
      "Round 2",
      [bipol, { ...mec, value: null, level: "low" }],
      { compare: true, axisMode: "values" },
      format,
    );
    expect(html).toContain(`${lineSampleHtml("c0", "solid")}BiPol`);
    expect(html).toContain(`${lineSampleHtml("c1", "dotted")}MEC`);
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
    expect(html).toContain(`${lineSampleHtml("c1", "dotted")}MEC`);
    expect(html).toContain("MEC: <b>0.50</b> · value 6.0000");
    // A constant series sits at the middle
    expect(html).toContain("BiPol: <b>0.50</b> · value 0.6000 · L:high");
  });
});
