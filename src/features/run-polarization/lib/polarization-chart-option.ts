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

export interface ChartSeriesInput {
  /** Unique name (legend, tooltip). */
  name: string;
  color: string;
  /** [round, value | null] real values (null = undefined for that round: a gap). */
  points: Array<[number, number | null]>;
  /** Min–max of the values, for the normalized axis. */
  range: ValueRange | null;
}

export interface PolarizationChartInput {
  series: readonly ChartSeriesInput[];
  /**
   * Several series are compared (the view has two or more): legend, no thresholds, `axisMode`.
   * Otherwise the single-series chart.
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

/**
 * Per-round polarization lines (one per series, in its colour) and the playhead. The single-series
 * chart: the package's thresholds as dotted rules, no legend, the real axis (the view as it was
 * before the comparison). Compared series: a legend, no thresholds, and the y axis either the
 * shared real values or each series' min–max normalization to [0, 1].
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
  const lines = series.map((line) => ({
    name: line.name,
    type: "line" as const,
    data: normalized ? normalizePoints(line.points, line.range) : line.points,
    showSymbol: false,
    connectNulls: false,
    itemStyle: { color: line.color },
    lineStyle: { color: line.color, width: 2 },
    ...(single ? { markLine: marks } : {}),
  }));
  // Several series: the playhead rides on a series of its own, so it never depends on a line.
  const playhead = { type: "line" as const, data: [], silent: true, markLine: marks };

  return {
    backgroundColor: "transparent",
    animation: false,
    grid: {
      ...CHART_GRID,
      top: single ? 10 : 22,
      right: drawn.length > 0 ? 64 : CHART_GRID.right,
    },
    ...(single
      ? {}
      : {
          legend: {
            ...legendStyle(theme),
            type: "scroll" as const,
            left: CHART_GRID.left,
            // Dots like the chips' swatches, on one compact line
            icon: "circle",
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 12,
            // Identifies the series; adding, removing and configuring happen in the chips.
            selectedMode: false,
            data: series.map((line) => line.name),
            pageIconColor: theme.text,
            pageIconInactiveColor: theme.axisLine,
            pageTextStyle: { color: theme.text, fontSize: 10 },
          },
        }),
    tooltip: axisTooltip(theme, (params: unknown) => {
      const target = tooltipTarget(params, round, series.length);
      return formatTooltip(target.round, target.indices);
    }),
    xAxis: timeAxis(theme),
    yAxis: normalized
      ? valueAxis(theme, { min: 0, max: 1, formatter: formatValue })
      : valueAxis(theme, { formatter: formatValue }),
    series: single ? lines : [...lines, playhead],
  };
}
