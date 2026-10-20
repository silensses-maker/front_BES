import ReactECharts from "echarts-for-react";
import { Maximize2, Minimize2 } from "lucide-react";
import { memo, type ReactNode, useMemo, useState } from "react";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { useChartTheme } from "@/shared/lib/use-chart-theme";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  buildTimeSeries,
  type DispersionMode,
  distributionOption,
  evolutionOption,
  participationOption,
  publicHistogram,
  publicPrivateOption,
} from "../lib/run-chart-options";
import { useRunChartInputs } from "../model/use-run-chart-inputs";

type BuiltInTab = "evo" | "dist" | "media" | "part" | "disp";
const BUILT_IN_TABS: readonly BuiltInTab[] = ["evo", "dist", "media", "part", "disp"];
/** Time tabs that read the per-round series (the others skip building them). */
const TIME_TABS: readonly BuiltInTab[] = ["media", "part", "disp"];

/**
 * An additional view rendered by the page into the card (a tab after the built-in ones). The card
 * renders `content` in the chart area while the tab is active; it owns its own chart and controls.
 */
export interface RunChartsExtraTab {
  key: string;
  label: string;
  content: ReactNode;
}

const NO_EXTRA_TABS: readonly RunChartsExtraTab[] = [];

interface RunChartsCardProps {
  maximized: boolean;
  onToggleMaximize: () => void;
  extraTabs?: readonly RunChartsExtraTab[];
}

/**
 * "Gráficas" card (mockup): Evolución de creencias / Distribución / Pública vs. privada /
 * Participación, plus Varianza (#129) and any extra tab the page provides. Time charts render only
 * received rounds and draw the playhead at the viewed round; the distribution reads the viewed
 * frame directly (round-aware by construction). Colors follow the theme tokens; live updates are
 * coalesced to one chart update per animation frame.
 */
export const RunChartsCard = memo(function RunChartsCard({
  maximized,
  onToggleMaximize,
  extraTabs = NO_EXTRA_TABS,
}: RunChartsCardProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<string>("evo");
  const [dispersion, setDispersion] = useState<DispersionMode>("std");
  const theme = useChartTheme();

  const { version, maxRound, latestFrame, currentRound } = useRunChartInputs();
  const topology = useSimulationStore((s) => s.topology);
  const agentCount = topology?.agentCount ?? 0;

  const extraTab = extraTabs.find((extra) => extra.key === tab) ?? null;
  // A tab whose extra view is gone falls back to the first one
  const activeTab: BuiltInTab | null =
    extraTab !== null
      ? null
      : BUILT_IN_TABS.includes(tab as BuiltInTab)
        ? (tab as BuiltInTab)
        : "evo";
  const selectedKey = extraTab?.key ?? activeTab;

  // Initial belief per agent index — colors the evolution spaghetti (mockup)
  const initialBeliefByIndex = useMemo(() => {
    const map = new Map<number, number>();
    if (topology) {
      for (const agent of topology.agents) map.set(agent.index, agent.initialBelief);
    }
    return map;
  }, [topology]);

  // ── Aggregate-driven series (mutable buffers keyed on version) ─────────────
  const needsTimeSeries = activeTab !== null && TIME_TABS.includes(activeTab);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the mutable-buffer change signal
  const timeSeries = useMemo(() => {
    const { aggregates } = useRoundAggregatesStore.getState();
    return buildTimeSeries(needsTimeSeries ? aggregates : [], maxRound, dispersion);
  }, [needsTimeSeries, version, maxRound, dispersion]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the mutable-buffer change signal
  const evolutionLines = useMemo(() => {
    if (activeTab !== "evo") return [];
    const { series } = useRoundAggregatesStore.getState();
    return Array.from(series.entries()).map(([agentIdx, points]) => ({
      name: `${t("runView.colAgent")} ${agentIdx}`,
      data: [...points].sort((a, b) => a[0] - b[0]),
      initialBelief: initialBeliefByIndex.get(agentIdx) ?? 0.5,
    }));
  }, [activeTab, version, initialBeliefByIndex, t]);

  // ── Distribution at the viewed round ───────────────────────────────────────
  const histogram = useMemo(
    () => publicHistogram(activeTab === "dist" ? (latestFrame?.publicBelief ?? null) : null),
    [activeTab, latestFrame],
  );

  const option = useMemo(() => {
    switch (activeTab) {
      case "evo":
        return evolutionOption(evolutionLines, currentRound, theme);
      case "dist":
        return distributionOption(
          histogram,
          t("runView.distributionTitle", { round: formatNumber(currentRound, i18n.language) }),
          theme,
        );
      case "media":
        return publicPrivateOption(
          timeSeries.meanPublic,
          timeSeries.meanPrivate,
          { public: t("runView.seriesPublic"), private: t("runView.seriesPrivate") },
          currentRound,
          theme,
        );
      case "disp":
        return publicPrivateOption(
          timeSeries.dispersionPublic,
          timeSeries.dispersionPrivate,
          { public: t("runView.seriesPublic"), private: t("runView.seriesPrivate") },
          currentRound,
          theme,
          { min: 0 },
        );
      case "part":
        return participationOption(timeSeries.participation, currentRound, theme);
      default:
        return null;
    }
  }, [activeTab, evolutionLines, histogram, timeSeries, currentRound, theme, t, i18n.language]);

  const note =
    activeTab === "evo" && agentCount > 50
      ? t("runView.sampleNote", { total: formatNumber(agentCount, i18n.language) })
      : activeTab === "media"
        ? t("runView.divergenceNote")
        : "";

  const tabs: Array<{ key: string; label: string }> = [
    { key: "evo", label: t("runView.tabEvolution") },
    { key: "dist", label: t("runView.tabDistribution") },
    { key: "media", label: t("runView.tabPublicPrivate") },
    { key: "part", label: t("runView.tabParticipation") },
    { key: "disp", label: t("runView.tabVariance") },
    ...extraTabs.map(({ key, label }) => ({ key, label })),
  ];

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        maximized ? "min-h-0 flex-1" : "h-[clamp(150px,28vh,250px)] min-h-37.5 flex-none",
      )}
    >
      <div className="flex flex-none items-center gap-0.5 border-b border-border px-3">
        <div className="flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={selectedKey === key}
              className={cn(
                "h-9 flex-none border-b-2 px-3 font-sans text-xs font-medium whitespace-nowrap",
                selectedKey === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-w-2 flex-1" />
        {activeTab === "disp" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="group"
                aria-label={t("runView.dispersionModeAria")}
                className="flex flex-none gap-0.5 rounded-lg border border-border bg-muted p-0.5"
              >
                {(["std", "variance"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={dispersion === mode}
                    onClick={() => setDispersion(mode)}
                    className={cn(
                      "h-6 rounded-md px-2.5 font-sans text-[11.5px] font-medium",
                      dispersion === mode
                        ? "bg-accent font-semibold text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {mode === "std" ? t("runView.dispersionStd") : t("runView.dispersionVariance")}
                  </button>
                ))}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {t("runView.dispersionTip")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="min-w-0 max-w-105 truncate font-sans text-[11px] text-muted-foreground">
            {note}
          </span>
        )}
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
        {extraTab !== null ? (
          extraTab.content
        ) : option !== null ? (
          <ReactECharts option={option} notMerge={true} style={{ width: "100%", height: "100%" }} />
        ) : null}
      </div>
    </div>
  );
});
