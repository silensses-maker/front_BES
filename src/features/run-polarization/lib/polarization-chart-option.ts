import {
  axisTooltip,
  CHART_GRID,
  playheadMarkLine,
  timeAxis,
  valueAxis,
} from "@/shared/lib/chart-options";
import type { ChartTheme } from "@/shared/lib/chart-theme";

export interface PolarizationChartInput {
  /** [round, value | null] (null = undefined for that round: a gap). */
  points: Array<[number, number | null]>;
  round: number;
  /** Classification boundaries with the label of the level each one starts. */
  thresholds: Array<{ value: number; label: string }>;
  seriesName: string;
  theme: ChartTheme;
  formatValue: (value: number) => string;
  formatTooltip: (round: number, value: number | null) => string;
}

/** Per-round polarization line, the playhead, and the package's thresholds as dashed rules. */
export function polarizationOption({
  points,
  round,
  thresholds,
  seriesName,
  theme,
  formatValue,
  formatTooltip,
}: PolarizationChartInput) {
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { ...CHART_GRID, top: 10, right: thresholds.length > 0 ? 64 : CHART_GRID.right },
    tooltip: axisTooltip(theme, (params: unknown) => {
      const first = (Array.isArray(params) ? params[0] : params) as
        | { value?: [number, number | null] }
        | undefined;
      const [r, v] = first?.value ?? [round, null];
      return formatTooltip(r, v ?? null);
    }),
    xAxis: timeAxis(theme),
    yAxis: valueAxis(theme, { formatter: formatValue }),
    series: [
      {
        name: seriesName,
        type: "line" as const,
        data: points,
        showSymbol: false,
        connectNulls: false,
        itemStyle: { color: theme.polarization },
        lineStyle: { color: theme.polarization, width: 2 },
        markLine: {
          ...playheadMarkLine(round, theme),
          data: [
            { xAxis: round },
            ...thresholds.map((threshold) => ({
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
        },
      },
    ],
  };
}
