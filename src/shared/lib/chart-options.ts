import type { ChartTheme } from "./chart-theme";

/**
 * ECharts option fragments shared by the run charts (#111 card, #129 variance and polarization
 * views): themed axes, grid, playhead and tooltip. Plain objects — no ECharts import here.
 */

export const CHART_GRID = { top: 14, bottom: 26, left: 46, right: 18 } as const;

export function axisStyle(theme: ChartTheme) {
  return {
    axisLabel: { fontSize: 10, color: theme.text },
    axisLine: { lineStyle: { color: theme.axisLine } },
    axisTick: { lineStyle: { color: theme.axisLine } },
    splitLine: { lineStyle: { color: theme.grid } },
  };
}

/** Round axis (x) of the time charts. */
export function timeAxis(theme: ChartTheme) {
  return { type: "value" as const, min: 0, ...axisStyle(theme) };
}

interface AxisLabel {
  fontSize: number;
  color: string;
  formatter?: (v: number) => string;
}

/** Value axis (y); `min`/`max` undefined = auto. */
export function valueAxis(
  theme: ChartTheme,
  { min, max, formatter }: { min?: number; max?: number; formatter?: (v: number) => string } = {},
) {
  const style = axisStyle(theme);
  const axisLabel: AxisLabel = formatter ? { ...style.axisLabel, formatter } : style.axisLabel;
  return { type: "value" as const, min, max, ...style, axisLabel };
}

/** Dashed playhead marker at the viewed round (mockup's vertical dashed line). */
export function playheadMarkLine(round: number, theme: ChartTheme) {
  return {
    silent: true,
    symbol: "none",
    animation: false,
    lineStyle: { type: "dashed" as const, color: theme.playhead, width: 1 },
    data: [{ xAxis: round }],
    label: { show: false },
  };
}

export function legendStyle(theme: ChartTheme) {
  return { top: 0, right: 40, textStyle: { fontSize: 10, color: theme.text } };
}

export function axisTooltip(theme: ChartTheme, formatter?: (params: unknown) => string) {
  return {
    trigger: "axis" as const,
    backgroundColor: theme.tooltipBackground,
    borderColor: theme.tooltipBorder,
    textStyle: { color: theme.tooltipText, fontSize: 11 },
    axisPointer: { type: "line" as const, lineStyle: { color: theme.playhead } },
    ...(formatter ? { formatter } : {}),
  };
}
