import ReactECharts from "echarts-for-react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSimulationStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AGENTS = 50;
const MAX_HISTORY = 500;

const AGENT_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface BeliefEvolutionChartProps {
  maximized: boolean;
  onToggleMaximize: () => void;
  maximizeLabel: string;
  restoreLabel: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BeliefEvolutionChart({
  maximized,
  onToggleMaximize,
  maximizeLabel,
  restoreLabel,
}: BeliefEvolutionChartProps) {
  const { t } = useTranslation();

  // topology is only needed to detect network switches (reset trigger)
  const topology = useSimulationStore((s) => s.topology);

  // Per-agent history: globalIndex → [round, belief][]
  const agentHistoryRef = useRef<Map<number, Array<[number, number]>>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<
    import("@/shared/workers/simulation-frame-merger").MergedFrame | null
  >(null);
  // Histories are append-only: ignore frames from a backward replay seek.
  const lastRoundRef = useRef(-1);

  const [series, setSeries] = useState<AgentSeries[]>([]);

  // Reset + resubscribe when the network changes. Using store.subscribe() (not
  // useEffect([latestFrame])) ensures every frame is accumulated even when React
  // batches multiple store.set() calls into a single render — which happens
  // during the pending-frames drain after topology arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: topology is the reset trigger
  useEffect(() => {
    agentHistoryRef.current = new Map();
    lastFrameRef.current = null;
    lastRoundRef.current = -1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSeries([]);

    function processFrame(
      frame: import("@/shared/workers/simulation-frame-merger").MergedFrame,
    ): void {
      if (frame === lastFrameRef.current) return;
      lastFrameRef.current = frame;
      if (frame.round <= lastRoundRef.current) return;
      lastRoundRef.current = frame.round;

      const totalAgents = frame.publicBelief.length;
      if (totalAgents === 0) return;

      const count = Math.min(totalAgents, MAX_AGENTS);
      const step = totalAgents <= MAX_AGENTS ? 1 : Math.floor(totalAgents / MAX_AGENTS);

      for (let i = 0; i < count; i++) {
        const idx = i * step;
        const belief = frame.publicBelief[idx] ?? 0;

        let hist = agentHistoryRef.current.get(idx);
        if (hist === undefined) {
          hist = [];
          agentHistoryRef.current.set(idx, hist);
        }
        if (hist.length >= MAX_HISTORY) hist.shift();
        hist.push([frame.round, belief]);
      }

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const snapshot: AgentSeries[] = Array.from(agentHistoryRef.current.entries()).map(
            ([agentIdx, data], i) => ({
              type: "line" as const,
              name: `${t("simulation.charts.agent")} ${agentIdx}`,
              data: [...data],
              showSymbol: false,
              animation: false,
              lineStyle: {
                color: AGENT_COLORS[i % AGENT_COLORS.length] ?? "#888",
                width: 1,
                opacity: 0.75,
              },
              emphasis: { disabled: true },
            }),
          );
          setSeries(snapshot);
        });
      }
    }

    // Catch any frame already in the store (mounted after sim started or after drain).
    const initial = useSimulationStore.getState().latestFrame;
    if (initial !== null) processFrame(initial);

    const unsub = useSimulationStore.subscribe((state) => {
      if (state.latestFrame !== null) processFrame(state.latestFrame);
    });

    return () => {
      unsub();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [topology, t]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      animation: false,
      title: {
        text: t("simulation.charts.beliefEvolution"),
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#888" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", label: { backgroundColor: "#444" } },
        formatter: (params: TooltipParam[]) => {
          if (!params.length) return "";
          const round = params[0]?.axisValue ?? "";
          const lines = params
            .slice(0, 8)
            .map(
              (p) =>
                `<span style="color:${p.color}">●</span> ${p.seriesName}: ${
                  Array.isArray(p.value) ? Number(p.value[1]).toFixed(3) : "—"
                }`,
            )
            .join("<br/>");
          return `Round ${round}<br/>${lines}${params.length > 8 ? "<br/>…" : ""}`;
        },
      },
      grid: { top: 40, bottom: 30, left: 45, right: 20 },
      xAxis: {
        type: "value",
        name: "Round",
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
        min: 0,
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        name: t("simulation.charts.belief"),
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
      },
      series,
    }),
    [series, t],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {series.length > 0 ? (
        <ReactECharts option={option} notMerge={false} style={{ width: "100%", height: "100%" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <p className="font-sans text-sm text-muted-foreground">{t("simulation.charts.noData")}</p>
        </div>
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

// ─── Local types ──────────────────────────────────────────────────────────────

interface AgentSeries {
  type: "line";
  name: string;
  data: Array<[number, number]>;
  showSymbol: boolean;
  animation: boolean;
  lineStyle: { color: string; width: number; opacity: number };
  emphasis: { disabled: boolean };
}

interface TooltipParam {
  color: string;
  seriesName: string;
  axisValue: number;
  value: unknown;
}
