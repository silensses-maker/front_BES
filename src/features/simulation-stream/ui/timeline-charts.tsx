import ReactECharts from "echarts-for-react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { ChartData } from "../model/use-chart-data";

interface TimelineChartsProps {
  chartData: ChartData;
  maximized: boolean;
  onToggleMaximize: () => void;
  maximizeLabel: string;
  restoreLabel: string;
  showMaximizeButton?: boolean;
}

export function TimelineCharts({
  chartData,
  maximized,
  onToggleMaximize,
  maximizeLabel,
  restoreLabel,
  showMaximizeButton = true,
}: TimelineChartsProps) {
  const { t } = useTranslation();

  const histogramOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      title: {
        text: t("simulation.charts.beliefHistogram"),
        textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
      },
      grid: { top: 30, bottom: 20, left: 30, right: 10 },
      xAxis: {
        type: "category",
        data: Array.from({ length: 20 }, (_, i) =>
          i === 0 ? "0" : i === 10 ? "0.5" : i === 19 ? "1" : "",
        ),
        axisLabel: { fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 9 } },
      series: [
        {
          type: "bar",
          data: chartData.beliefHistogram,
          itemStyle: { color: "#3b82f6" },
          barMaxWidth: 20,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartData.beliefHistogram, t],
  );

  const meanBeliefOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      title: {
        text: t("simulation.charts.meanBeliefLine"),
        textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
      },
      legend: { bottom: 0, textStyle: { fontSize: 9, color: "#888" } },
      grid: { top: 30, bottom: 30, left: 35, right: 10 },
      xAxis: {
        type: "value",
        name: "Round",
        nameTextStyle: { fontSize: 9 },
        axisLabel: { fontSize: 9 },
        min: 0,
      },
      yAxis: { type: "value", min: 0, max: 1, axisLabel: { fontSize: 9 } },
      series: [
        {
          name: t("simulation.charts.seriesMeanPublic"),
          type: "line",
          data: chartData.beliefTimeline.map((p) => [p.round, +p.meanPublic.toFixed(3)]),
          showSymbol: false,
          lineStyle: { color: "#3b82f6", width: 1.5 },
        },
        {
          name: t("simulation.charts.seriesMeanPrivate"),
          type: "line",
          data: chartData.beliefTimeline.map((p) => [p.round, +p.meanPrivate.toFixed(3)]),
          showSymbol: false,
          lineStyle: { color: "#94a3b8", width: 1.5, type: "dashed" },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartData.beliefTimeline, t],
  );

  const speakingRateOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      title: {
        text: t("simulation.charts.speakingRateLine"),
        textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
      },
      grid: { top: 30, bottom: 20, left: 35, right: 10 },
      xAxis: {
        type: "value",
        name: "Round",
        nameTextStyle: { fontSize: 9 },
        axisLabel: { fontSize: 9 },
        min: 0,
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          fontSize: 9,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
      },
      series: [
        {
          name: t("simulation.charts.speakingRate"),
          type: "line",
          data: chartData.speakingTimeline.map((p) => [p.round, +p.rate.toFixed(3)]),
          showSymbol: false,
          lineStyle: { color: "#f59e0b", width: 1.5 },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartData.speakingTimeline, t],
  );

  return (
    <div className="relative flex h-full w-full flex-row gap-1 p-2">
      <div className="min-h-0 min-w-0 flex-1">
        <ReactECharts
          option={histogramOption}
          notMerge={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <ReactECharts
          option={meanBeliefOption}
          notMerge={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <ReactECharts
          option={speakingRateOption}
          notMerge={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {showMaximizeButton && (
        <MaximizeButton
          maximized={maximized}
          onClick={onToggleMaximize}
          maximizeLabel={maximizeLabel}
          restoreLabel={restoreLabel}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MaximizeButtonProps {
  maximized: boolean;
  onClick: () => void;
  maximizeLabel: string;
  restoreLabel: string;
}

function MaximizeButton({ maximized, onClick, maximizeLabel, restoreLabel }: MaximizeButtonProps) {
  const Icon = maximized ? Minimize2 : Maximize2;
  const label = maximized ? restoreLabel : maximizeLabel;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-2 top-2"
      aria-label={label}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}
