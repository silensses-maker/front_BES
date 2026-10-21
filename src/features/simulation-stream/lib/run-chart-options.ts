import type { RoundAggregate } from "@/entities/simulation";
import {
  axisStyle,
  axisTooltip,
  CHART_GRID,
  legendStyle,
  playheadMarkLine,
  timeAxis,
  valueAxis,
} from "@/shared/lib/chart-options";
import type { ChartTheme } from "@/shared/lib/chart-theme";
import { interpolateOpinion } from "@/shared/lib/opinion-palette";

/** ECharts options of the run charts card (#111), themed (#129). Pure: built from buffers. */

export const HISTOGRAM_BINS = 20;

export type DispersionMode = "variance" | "std";

export interface TimeSeries {
  meanPublic: Array<[number, number]>;
  meanPrivate: Array<[number, number]>;
  participation: Array<[number, number]>;
  dispersionPublic: Array<[number, number]>;
  dispersionPrivate: Array<[number, number]>;
}

/** Per-round series from the sparse aggregates (rounds 0…maxRound that exist). */
export function buildTimeSeries(
  aggregates: ReadonlyArray<RoundAggregate | undefined>,
  maxRound: number,
  dispersion: DispersionMode,
): TimeSeries {
  const out: TimeSeries = {
    meanPublic: [],
    meanPrivate: [],
    participation: [],
    dispersionPublic: [],
    dispersionPrivate: [],
  };
  const transform = dispersion === "std" ? Math.sqrt : (v: number) => v;
  for (let round = 0; round <= maxRound; round++) {
    const agg = aggregates[round];
    if (agg === undefined) continue;
    out.meanPublic.push([round, +agg.meanPublic.toFixed(4)]);
    out.meanPrivate.push([round, +agg.meanPrivate.toFixed(4)]);
    out.participation.push([round, +agg.participation.toFixed(4)]);
    out.dispersionPublic.push([round, +transform(agg.variancePublic).toPrecision(6)]);
    out.dispersionPrivate.push([round, +transform(agg.variancePrivate).toPrecision(6)]);
  }
  return out;
}

/** 20-bin histogram of the public beliefs of a frame. */
export function publicHistogram(publicBelief: Float32Array | null): number[] {
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  if (publicBelief === null) return bins;
  for (let i = 0; i < publicBelief.length; i++) {
    const belief = publicBelief[i] ?? 0;
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(belief * HISTOGRAM_BINS)));
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  return bins;
}

export interface EvolutionLine {
  name: string;
  data: Array<[number, number]>;
  initialBelief: number;
}

export function evolutionOption(lines: EvolutionLine[], round: number, theme: ChartTheme) {
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: CHART_GRID,
    xAxis: timeAxis(theme),
    yAxis: valueAxis(theme, { min: 0, max: 1 }),
    series: [
      ...lines.map((line) => ({
        type: "line" as const,
        name: line.name,
        data: line.data,
        showSymbol: false,
        animation: false,
        lineStyle: { color: interpolateOpinion(line.initialBelief), width: 1, opacity: 0.6 },
        emphasis: { disabled: true },
      })),
      { type: "line" as const, data: [], markLine: playheadMarkLine(round, theme) },
    ],
  };
}

export function distributionOption(histogram: number[], title: string, theme: ChartTheme) {
  return {
    backgroundColor: "transparent",
    animation: false,
    title: {
      text: title,
      left: "center",
      textStyle: { fontSize: 11, fontWeight: "normal" as const, color: theme.text },
    },
    grid: { ...CHART_GRID, top: 26 },
    xAxis: {
      ...axisStyle(theme),
      type: "category" as const,
      data: Array.from({ length: HISTOGRAM_BINS }, (_, i) =>
        i === 0 ? "0" : i === HISTOGRAM_BINS / 2 ? "0.5" : i === HISTOGRAM_BINS - 1 ? "1" : "",
      ),
      axisTick: { show: false },
    },
    yAxis: valueAxis(theme),
    series: [
      {
        type: "bar" as const,
        data: histogram.map((count, i) => ({
          value: count,
          itemStyle: { color: interpolateOpinion((i + 0.5) / HISTOGRAM_BINS) },
        })),
        barCategoryGap: "12%",
      },
    ],
  };
}

/** Default y range of the public / private charts: beliefs live in [0, 1]. */
const UNIT_Y_RANGE: { min?: number; max?: number } = { min: 0, max: 1 };

/** Public (solid) vs private (dashed) — the mean chart and the dispersion chart share it. */
export function publicPrivateOption(
  publicData: Array<[number, number]>,
  privateData: Array<[number, number]>,
  labels: { public: string; private: string },
  round: number,
  theme: ChartTheme,
  yRange: { min?: number; max?: number } = UNIT_Y_RANGE,
) {
  return {
    backgroundColor: "transparent",
    animation: false,
    legend: legendStyle(theme),
    tooltip: axisTooltip(theme),
    grid: { ...CHART_GRID, top: 24 },
    xAxis: timeAxis(theme),
    yAxis: valueAxis(theme, yRange),
    series: [
      {
        name: labels.public,
        type: "line" as const,
        data: publicData,
        showSymbol: false,
        itemStyle: { color: theme.public },
        lineStyle: { color: theme.public, width: 2 },
        markLine: playheadMarkLine(round, theme),
      },
      {
        name: labels.private,
        type: "line" as const,
        data: privateData,
        showSymbol: false,
        itemStyle: { color: theme.private },
        lineStyle: { color: theme.private, width: 2, type: "dashed" as const },
      },
    ],
  };
}

export function participationOption(
  data: Array<[number, number]>,
  round: number,
  theme: ChartTheme,
) {
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: CHART_GRID,
    xAxis: timeAxis(theme),
    yAxis: valueAxis(theme, {
      min: 0,
      max: 1,
      formatter: (v: number) => `${Math.round(v * 100)}%`,
    }),
    series: [
      {
        type: "line" as const,
        data,
        showSymbol: false,
        lineStyle: { color: theme.participation, width: 2 },
        markLine: playheadMarkLine(round, theme),
      },
    ],
  };
}
