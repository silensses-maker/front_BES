import ReactECharts from "echarts-for-react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { interpolateOpinion } from "@/shared/lib/opinion-palette";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

type ChartTab = "evo" | "dist" | "media" | "part";

interface RunChartsCardProps {
  maximized: boolean;
  onToggleMaximize: () => void;
}

const HISTOGRAM_BINS = 20;

const BASE_TIME_AXIS = {
  type: "value" as const,
  min: 0,
  axisLabel: { fontSize: 10 },
};

/** Dashed playhead marker at the viewed round (mockup's vertical dashed line). */
function playheadMarkLine(round: number) {
  return {
    silent: true,
    symbol: "none",
    animation: false,
    lineStyle: { type: "dashed" as const, color: "#8892b3", width: 1 },
    data: [{ xAxis: round }],
    label: { show: false },
  };
}

/**
 * "Gráficas" card (mockup): 4 tabs — Evolución de creencias / Distribución /
 * Pública vs. privada / Participación. Time charts render only received
 * rounds and draw the playhead at the viewed round; the distribution reads
 * the viewed frame directly (round-aware by construction).
 */
export function RunChartsCard({ maximized, onToggleMaximize }: RunChartsCardProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<ChartTab>("evo");

  const version = useRoundAggregatesStore((s) => s.version);
  const topology = useSimulationStore((s) => s.topology);
  const latestFrame = useSimulationStore((s) => s.latestFrame);
  const currentRound = useSimulationStore((s) => s.currentRound);

  const agentCount = topology?.agentCount ?? 0;

  // Initial belief per agent index — colors the evolution spaghetti (mockup)
  const initialBeliefByIndex = useMemo(() => {
    const map = new Map<number, number>();
    if (topology) {
      for (const agent of topology.agents) map.set(agent.index, agent.initialBelief);
    }
    return map;
  }, [topology]);

  // ── Aggregate-driven series (mutable buffers keyed on version) ─────────────
  const { evolutionSeries, meanSeries, participationSeries } = useMemo(() => {
    const { series, aggregates, maxRound } = useRoundAggregatesStore.getState();
    void version;

    const evolution = Array.from(series.entries()).map(([agentIdx, points]) => ({
      type: "line" as const,
      name: `${t("runView.colAgent")} ${agentIdx}`,
      data: [...points].sort((a, b) => a[0] - b[0]),
      showSymbol: false,
      animation: false,
      lineStyle: {
        color: interpolateOpinion(initialBeliefByIndex.get(agentIdx) ?? 0.5),
        width: 1,
        opacity: 0.6,
      },
      emphasis: { disabled: true },
    }));

    const mean: Array<[number, number]> = [];
    const meanPrivate: Array<[number, number]> = [];
    const participation: Array<[number, number]> = [];
    for (let round = 0; round <= maxRound; round++) {
      const agg = aggregates[round];
      if (agg === undefined) continue;
      mean.push([round, +agg.meanPublic.toFixed(4)]);
      meanPrivate.push([round, +agg.meanPrivate.toFixed(4)]);
      participation.push([round, +agg.participation.toFixed(4)]);
    }
    return {
      evolutionSeries: evolution,
      meanSeries: { mean, meanPrivate },
      participationSeries: participation,
    };
  }, [version, initialBeliefByIndex, t]);

  // ── Distribution at the viewed round ───────────────────────────────────────
  const histogram = useMemo(() => {
    const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
    if (latestFrame === null) return bins;
    for (let i = 0; i < latestFrame.publicBelief.length; i++) {
      const belief = latestFrame.publicBelief[i] ?? 0;
      const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor(belief * HISTOGRAM_BINS));
      bins[bin] = (bins[bin] ?? 0) + 1;
    }
    return bins;
  }, [latestFrame]);

  const option = useMemo(() => {
    if (tab === "evo") {
      return {
        backgroundColor: "transparent",
        animation: false,
        grid: { top: 14, bottom: 26, left: 46, right: 18 },
        xAxis: BASE_TIME_AXIS,
        yAxis: { type: "value", min: 0, max: 1, axisLabel: { fontSize: 10 } },
        series: [
          ...evolutionSeries,
          { type: "line", data: [], markLine: playheadMarkLine(currentRound) },
        ],
      };
    }
    if (tab === "dist") {
      return {
        backgroundColor: "transparent",
        animation: false,
        title: {
          text: t("runView.distributionTitle", {
            round: formatNumber(currentRound, i18n.language),
          }),
          left: "center",
          textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
        },
        grid: { top: 26, bottom: 26, left: 46, right: 18 },
        xAxis: {
          type: "category",
          data: Array.from({ length: HISTOGRAM_BINS }, (_, i) =>
            i === 0 ? "0" : i === HISTOGRAM_BINS / 2 ? "0.5" : i === HISTOGRAM_BINS - 1 ? "1" : "",
          ),
          axisLabel: { fontSize: 10 },
          axisTick: { show: false },
        },
        yAxis: { type: "value", axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            data: histogram.map((count, i) => ({
              value: count,
              itemStyle: { color: interpolateOpinion((i + 0.5) / HISTOGRAM_BINS) },
            })),
            barCategoryGap: "12%",
          },
        ],
      };
    }
    if (tab === "media") {
      return {
        backgroundColor: "transparent",
        animation: false,
        legend: { top: 0, right: 40, textStyle: { fontSize: 10, color: "#888" } },
        grid: { top: 24, bottom: 26, left: 46, right: 18 },
        xAxis: BASE_TIME_AXIS,
        yAxis: { type: "value", min: 0, max: 1, axisLabel: { fontSize: 10 } },
        series: [
          {
            name: t("runView.seriesPublic"),
            type: "line",
            data: meanSeries.mean,
            showSymbol: false,
            lineStyle: { color: "#4f6bd8", width: 2 },
            markLine: playheadMarkLine(currentRound),
          },
          {
            name: t("runView.seriesPrivate"),
            type: "line",
            data: meanSeries.meanPrivate,
            showSymbol: false,
            lineStyle: { color: "#7cb342", width: 2, type: "dashed" },
          },
        ],
      };
    }
    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { top: 14, bottom: 26, left: 46, right: 18 },
      xAxis: BASE_TIME_AXIS,
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { fontSize: 10, formatter: (v: number) => `${Math.round(v * 100)}%` },
      },
      series: [
        {
          type: "line",
          data: participationSeries,
          showSymbol: false,
          lineStyle: { color: "#c98a2e", width: 2 },
          markLine: playheadMarkLine(currentRound),
        },
      ],
    };
  }, [
    tab,
    evolutionSeries,
    meanSeries,
    participationSeries,
    histogram,
    currentRound,
    t,
    i18n.language,
  ]);

  const note =
    tab === "evo" && agentCount > 50
      ? t("runView.sampleNote", { total: formatNumber(agentCount, i18n.language) })
      : tab === "media"
        ? t("runView.divergenceNote")
        : "";

  const tabs: Array<{ key: ChartTab; label: string }> = [
    { key: "evo", label: t("runView.tabEvolution") },
    { key: "dist", label: t("runView.tabDistribution") },
    { key: "media", label: t("runView.tabPublicPrivate") },
    { key: "part", label: t("runView.tabParticipation") },
  ];

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        maximized ? "min-h-0 flex-1" : "h-[clamp(150px,28vh,250px)] min-h-37.5 flex-none",
      )}
    >
      <div className="flex flex-none items-center gap-0.5 border-b border-border px-3">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "h-9 border-b-2 px-3 font-sans text-xs font-medium",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
        <div className="min-w-2 flex-1" />
        <span className="max-w-105 truncate font-sans text-[11px] text-muted-foreground">
          {note}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("runView.maximizeChartAria")}
              onClick={onToggleMaximize}
            >
              {maximized ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {maximized ? t("runView.restoreChartTip") : t("runView.maximizeChartTip")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="relative min-h-0 flex-1">
        <ReactECharts option={option} notMerge={true} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
