import ReactECharts from "echarts-for-react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { ChartData } from "../model/use-chart-data";

interface StrategyChartsProps {
  chartData: ChartData;
  maximized: boolean;
  onToggleMaximize: () => void;
  maximizeLabel: string;
  restoreLabel: string;
}

export function StrategyCharts({
  chartData,
  maximized,
  onToggleMaximize,
  maximizeLabel,
  restoreLabel,
}: StrategyChartsProps) {
  const { t } = useTranslation();

  const strategyOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 10, color: "#888" },
        itemWidth: 10,
        itemHeight: 10,
      },
      title: {
        text: t("simulation.charts.strategyPie"),
        left: "center",
        top: 0,
        textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
      },
      series: [
        {
          type: "pie",
          radius: ["30%", "60%"],
          center: ["50%", "45%"],
          data: chartData.strategyPie,
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 10 } },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartData.strategyPie, t],
  );

  const effectOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 10, color: "#888" },
        itemWidth: 10,
        itemHeight: 10,
      },
      title: {
        text: t("simulation.charts.effectPie"),
        left: "center",
        top: 0,
        textStyle: { fontSize: 11, fontWeight: "normal", color: "#888" },
      },
      series: [
        {
          type: "pie",
          radius: ["30%", "60%"],
          center: ["50%", "45%"],
          data: chartData.effectPie,
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 10 } },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartData.effectPie, t],
  );

  const noData = chartData.strategyPie.length === 0;

  return (
    <div className="relative flex h-full w-full flex-col gap-1 overflow-hidden p-2">
      {noData ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("simulation.charts.noData")}</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1">
            <ReactECharts
              option={strategyOption}
              notMerge={false}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div className="min-h-0 flex-1">
            <ReactECharts
              option={effectOption}
              notMerge={false}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </>
      )}
      <MaximizeButton
        maximized={maximized}
        onClick={onToggleMaximize}
        maximizeLabel={maximizeLabel}
        restoreLabel={restoreLabel}
      />
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
