import {
  axisTooltip,
  CHART_GRID,
  legendStyle,
  playheadMarkLine,
  timeAxis,
  valueAxis,
} from "@/shared/lib/chart-options";
import type { ChartTheme } from "@/shared/lib/chart-theme";
import { type AxisMode, normalizePoints, type ValueRange } from "./normalize";
import {
  dashGeometry,
  echartsLineStyle,
  type LineDash,
  MARKER_SIZE,
  markerPhase,
  markerPoints,
} from "./series-style";

/** The legend is drawn up to this many series; more are identified by the chips above. */
export const LEGEND_MAX_SERIES = 4;

export interface ChartSeriesInput {
  /** Unique name (legend, tooltip). */
  name: string;
  color: string;
  /** Line style (series-style.ts, from the series' slot). */
  dash: LineDash;
  /** The series' slot (staggers its markers). */
  slot: number;
  /** [round, value | null] real values (null = undefined for that round: a gap). */
  points: Array<[number, number | null]>;
  /** Min–max of the values, for the normalized axis. */
  range: ValueRange | null;
}

export interface PolarizationChartInput {
  series: readonly ChartSeriesInput[];
  /**
   * Several series are compared (the view has two or more): legend (up to LEGEND_MAX_SERIES), no
   * thresholds, `axisMode`. Otherwise the single-series chart.
   */
  compare: boolean;
  round: number;
  /**
   * Classification boundaries with the label of the level each one starts. Drawn only in the
   * single-series chart (compared series have no common thresholds).
   */
  thresholds: Array<{ value: number; label: string }>;
  /** Shared y axis of compared series; the single-series chart always shows the real values. */
  axisMode: AxisMode;
  theme: ChartTheme;
  formatValue: (value: number) => string;
  /** Tooltip HTML at a round, for the indices (in `series`) of the series ECharts shows there. */
  formatTooltip: (round: number, seriesIndices: number[]) => string;
}

interface AxisParam {
  axisValue?: unknown;
  seriesIndex?: unknown;
  value?: unknown;
}

/** The hovered round and the series at it, from ECharts' axis-tooltip params. */
export function tooltipTarget(
  params: unknown,
  fallbackRound: number,
  seriesCount: number,
): { round: number; indices: number[] } {
  const list = (Array.isArray(params) ? params : [params]).filter(
    (p): p is AxisParam => typeof p === "object" && p !== null,
  );
  const first = list[0];
  let round = fallbackRound;
  if (typeof first?.axisValue === "number") round = first.axisValue;
  else if (Array.isArray(first?.value) && typeof first.value[0] === "number")
    round = first.value[0];
  const indices = list
    .map((p) => p.seriesIndex)
    .filter((i): i is number => typeof i === "number" && i >= 0 && i < seriesCount);
  return { round, indices };
}

/** A marked line's sparse markers: a silent scatter series of its own, out of the tooltip. */
function markerSeries(
  line: ChartSeriesInput,
  data: ReadonlyArray<readonly [number, number | null]>,
) {
  const marker = dashGeometry(line.dash).marker;
  if (marker === null) return [];
  return [
    {
      type: "scatter" as const,
      data: markerPoints(data, markerPhase(line.slot)),
      symbol: marker,
      symbolSize: MARKER_SIZE,
      itemStyle: { color: line.color },
      silent: true,
      tooltip: { show: false },
      z: 3,
    },
  ];
}

/**
 * The compared series' legend: each icon is a short line in the series' colour and dash, like the
 * chips' samples (ECharts draws a line series' icon from its line style, with its symbol in the
 * middle, hidden here: it would cover the dash). Up to LEGEND_MAX_SERIES: past that, a one-line
 * legend would page through the names a few at a time, and the chips above the chart (wrapping,
 * with the same line samples) are the key.
 */
function compareLegend(series: readonly ChartSeriesInput[], theme: ChartTheme) {
  return {
    ...legendStyle(theme),
    type: "scroll" as const,
    left: CHART_GRID.left,
    itemWidth: 22,
    itemHeight: 8,
    itemGap: 12,
    itemStyle: { opacity: 0 },
    // Identifies the series; adding, removing and configuring happen in the chips.
    selectedMode: false,
    data: series.map((line) => line.name),
    pageIconColor: theme.text,
    pageIconInactiveColor: theme.axisLine,
    pageTextStyle: { color: theme.text, fontSize: 10 },
  };
}

/**
 * Per-round polarization lines (one per series, in its colour and line style, the dashed and
 * dotted ones with sparse markers) and the playhead. The single-series chart: the package's
 * thresholds as dotted rules, no legend, the real axis (the view as it was before the
 * comparison). Compared series: a legend (up to LEGEND_MAX_SERIES), no thresholds, and the y
 * axis either the shared real values or each series' min–max normalization to [0, 1].
 */
export function polarizationOption({
  series,
  compare,
  round,
  thresholds,
  axisMode,
  theme,
  formatValue,
  formatTooltip,
}: PolarizationChartInput) {
  const single = !compare;
  const normalized = compare && axisMode === "normalized";
  const drawn = single ? thresholds : [];
  const marks = {
    ...playheadMarkLine(round, theme),
    data: [
      { xAxis: round },
      ...drawn.map((threshold) => ({
        yAxis: threshold.value,
        lineStyle: { type: "dotted" as const, color: theme.thresholds, width: 1 },
        label: {
          show: true,
          position: "end" as const,
          formatter: threshold.label,
          color: theme.text,
          fontSize: 9.5,
        },
      })),
    ],
  };
  const drawnData = series.map((line) =>
    normalized ? normalizePoints(line.points, line.range) : line.points,
  );
  const lines = series.map((line, index) => {
    const marker = dashGeometry(line.dash).marker;
    return {
      name: line.name,
      type: "line" as const,
      data: drawnData[index] ?? [],
      showSymbol: false,
      // The point under the pointer is shown with the line's marker (solid: the default circle)
      ...(marker === null ? {} : { symbol: marker, symbolSize: MARKER_SIZE }),
      connectNulls: false,
      itemStyle: { color: line.color },
      lineStyle: echartsLineStyle(line.color, line.dash),
      ...(single ? { markLine: marks } : {}),
    };
  });
  // Several series: the playhead rides on a series of its own, so it never depends on a line.
  const playhead = { type: "line" as const, data: [], silent: true, markLine: marks };
  // After the lines (and the playhead): the tooltip only reads indices below series.length
  const markers = series.flatMap((line, index) => markerSeries(line, drawnData[index] ?? []));
  const legend = !single && series.length <= LEGEND_MAX_SERIES;

  return {
    backgroundColor: "transparent",
    animation: false,
    grid: {
      ...CHART_GRID,
      top: legend ? 22 : 10,
      right: drawn.length > 0 ? 64 : CHART_GRID.right,
    },
    ...(legend ? { legend: compareLegend(series, theme) } : {}),
    tooltip: axisTooltip(theme, (params: unknown) => {
      const target = tooltipTarget(params, round, series.length);
      return formatTooltip(target.round, target.indices);
    }),
    xAxis: timeAxis(theme),
    yAxis: normalized
      ? valueAxis(theme, { min: 0, max: 1, formatter: formatValue })
      : valueAxis(theme, { formatter: formatValue }),
    series: single ? [...lines, ...markers] : [...lines, playhead, ...markers],
  };
}
