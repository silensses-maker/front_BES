import { describe, expect, it } from "vitest";
import type { RoundAggregate } from "@/entities/simulation";
import { readChartTheme } from "@/shared/lib/chart-theme";
import {
  buildTimeSeries,
  distributionOption,
  evolutionOption,
  HISTOGRAM_BINS,
  participationOption,
  publicHistogram,
  publicPrivateOption,
} from "./run-chart-options";

const theme = readChartTheme();

const agg = (round: number): RoundAggregate => ({
  meanPublic: 0.1 * round,
  meanPrivate: 0.2,
  spread: 0.5,
  participation: 0.75,
  variancePublic: 0.04,
  variancePrivate: 0.0225,
});

describe("buildTimeSeries", () => {
  it("emits the defined rounds up to maxRound, with σ or σ²", () => {
    const aggregates = [agg(0), undefined, agg(2), agg(3)];
    const std = buildTimeSeries(aggregates, 2, "std");
    expect(std.meanPublic).toEqual([
      [0, 0],
      [2, 0.2],
    ]);
    expect(std.participation).toEqual([
      [0, 0.75],
      [2, 0.75],
    ]);
    expect(std.dispersionPublic).toEqual([
      [0, 0.2],
      [2, 0.2],
    ]);
    expect(std.dispersionPrivate[0]).toEqual([0, 0.15]);
    const variance = buildTimeSeries(aggregates, 3, "variance");
    expect(variance.dispersionPublic).toHaveLength(3);
    expect(variance.dispersionPublic[0]).toEqual([0, 0.04]);
  });
});

describe("publicHistogram", () => {
  it("counts public beliefs in 20 bins (1 in the last bin, clamps negatives)", () => {
    const bins = publicHistogram(new Float32Array([0, 0.5, 1, 1, -0.2]));
    expect(bins).toHaveLength(HISTOGRAM_BINS);
    expect(bins[0]).toBe(2);
    expect(bins[10]).toBe(1);
    expect(bins[19]).toBe(2);
    expect(publicHistogram(null).every((count) => count === 0)).toBe(true);
  });
});

describe("chart options", () => {
  it("evolution: one line per sampled agent plus the playhead", () => {
    const option = evolutionOption(
      [{ name: "Agent 1", data: [[0, 0.2]], initialBelief: 0.2 }],
      4,
      theme,
    );
    expect(option.series).toHaveLength(2);
    expect(option.series[1]).toMatchObject({ markLine: { data: [{ xAxis: 4 }] } });
    expect(option.yAxis).toMatchObject({ min: 0, max: 1 });
  });

  it("distribution: colored bars and a themed title", () => {
    const option = distributionOption(new Array(HISTOGRAM_BINS).fill(1), "Round 3", theme);
    expect(option.title.textStyle.color).toBe(theme.text);
    expect(option.xAxis.data).toHaveLength(HISTOGRAM_BINS);
    expect(option.series[0]?.data).toHaveLength(HISTOGRAM_BINS);
  });

  it("public vs private: theme colors, solid and dashed, custom y range", () => {
    const option = publicPrivateOption(
      [[0, 0.5]],
      [[0, 0.4]],
      { public: "Public", private: "Private" },
      0,
      theme,
      { min: 0 },
    );
    expect(option.series[0]).toMatchObject({ name: "Public", lineStyle: { color: theme.public } });
    expect(option.series[1]).toMatchObject({ lineStyle: { color: theme.private, type: "dashed" } });
    expect(option.yAxis).toMatchObject({ min: 0, max: undefined });
  });

  it("participation: percent axis in the participation color", () => {
    const option = participationOption([[0, 1]], 0, theme);
    expect(option.series[0]?.lineStyle.color).toBe(theme.participation);
    expect(option.yAxis.axisLabel.formatter?.(0.5)).toBe("50%");
  });
});
