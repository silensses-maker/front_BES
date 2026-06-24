import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { SimulationCanvas } from "@/features/simulation-canvas";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import { useChartData, type ChartData } from "../model/use-chart-data";
import { useSimulationStream } from "../model/use-simulation-stream";
import { BeliefEvolutionChart } from "./belief-evolution-chart";
import { StrategyCharts } from "./strategy-charts";
import { TimelineCharts } from "./timeline-charts";

const PANEL_DEFAULTS = {
  top: 70,
  c: 30,
  a: 25,
  b: 75,
} as const;

type MaximizedPanel = "a" | "b" | "c" | null;

interface SimulationRunViewProps {
  runId: string;
  networkId: string;
}

/**
 * SimulationRunView — owns only the three-panel resizable layout.
 *
 * Status display (dot, round counter, agent count, cancel button) has moved
 * to <LiveRunSidebar> which is injected by LiveRunPage into the dashboard
 * sidebar slot. This component's sole responsibility is the canvas layout
 * and the maximize/restore mechanics.
 */
export function SimulationRunView({ runId, networkId }: SimulationRunViewProps) {
  const { t } = useTranslation();
  const { status, topology } = useSimulationStream(runId, networkId);

  const panelTopRef = useRef<PanelImperativeHandle | null>(null);
  const panelARef = useRef<PanelImperativeHandle | null>(null);
  const panelBRef = useRef<PanelImperativeHandle | null>(null);
  const panelCRef = useRef<PanelImperativeHandle | null>(null);

  const [maximized, setMaximized] = useState<MaximizedPanel>(null);

  const strategyLabel = useCallback(
    (v: number): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceStrategy.degroot"),
        1: t("enums.silenceStrategy.majority"),
        2: t("enums.silenceStrategy.threshold"),
        3: t("enums.silenceStrategy.confidence"),
      };
      return map[v] ?? String(v);
    },
    [t],
  );

  const effectLabel = useCallback(
    (v: number): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceEffect.degroot"),
        1: t("enums.silenceEffect.memory"),
        2: t("enums.silenceEffect.memoryless"),
      };
      return map[v] ?? String(v);
    },
    [t],
  );

  const chartData = useChartData(strategyLabel, effectLabel);

  const handleMaximize = useCallback(
    (target: "a" | "b" | "c") => {
      if (maximized === target) {
        if (target === "a") {
          panelBRef.current?.expand();
          panelCRef.current?.expand();
        } else if (target === "b") {
          panelARef.current?.expand();
          panelCRef.current?.expand();
        } else {
          panelTopRef.current?.expand();
        }
        setMaximized(null);
        return;
      }

      if (target === "a") {
        panelBRef.current?.collapse();
        panelCRef.current?.collapse();
      } else if (target === "b") {
        panelARef.current?.collapse();
        panelCRef.current?.collapse();
      } else {
        panelTopRef.current?.collapse();
      }
      setMaximized(target);
    },
    [maximized],
  );

  return (
    <div className="flex h-full flex-col p-4">
      {/* Three-panel resizable layout */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        {/* Outer: vertical split — top area (A + B) above, Panel C full-width below */}
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel
            panelRef={panelTopRef}
            id="panel-top"
            defaultSize={PANEL_DEFAULTS.top}
            minSize={20}
            collapsible
            collapsedSize={0}
          >
            {/* Inner: horizontal split — Panel A (stats) left, Panel B (canvas) right */}
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel
                panelRef={panelARef}
                id="panel-a"
                defaultSize={PANEL_DEFAULTS.a}
                minSize={15}
                collapsible
                collapsedSize={0}
              >
                <StrategyCharts
                  chartData={chartData}
                  maximized={maximized === "a"}
                  onToggleMaximize={() => handleMaximize("a")}
                  maximizeLabel={t("simulation.maximizePanel")}
                  restoreLabel={t("simulation.restorePanel")}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel
                panelRef={panelBRef}
                id="panel-b"
                defaultSize={PANEL_DEFAULTS.b}
                minSize={30}
                collapsible
                collapsedSize={0}
              >
                <div className="relative h-full w-full">
                  <SimulationCanvas status={status} topology={topology} />
                  <MaximizeButton
                    maximized={maximized === "b"}
                    onClick={() => handleMaximize("b")}
                    maximizeLabel={t("simulation.maximizePanel")}
                    restoreLabel={t("simulation.restorePanel")}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Panel C — full width, timeline charts */}
          <ResizablePanel
            panelRef={panelCRef}
            id="panel-c"
            defaultSize={PANEL_DEFAULTS.c}
            minSize={15}
            collapsible
            collapsedSize={0}
          >
            <PanelCContent
              chartData={chartData}
              maximized={maximized === "c"}
              onToggleMaximize={() => handleMaximize("c")}
              maximizeLabel={t("simulation.maximizePanel")}
              restoreLabel={t("simulation.restorePanel")}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PanelCContentProps {
  chartData: ChartData;
  maximized: boolean;
  onToggleMaximize: () => void;
  maximizeLabel: string;
  restoreLabel: string;
}

function PanelCContent({
  chartData,
  maximized,
  onToggleMaximize,
  maximizeLabel,
  restoreLabel,
}: PanelCContentProps) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className={maximized ? "h-1/2" : "h-full"}>
        <BeliefEvolutionChart
          maximized={maximized}
          onToggleMaximize={onToggleMaximize}
          maximizeLabel={maximizeLabel}
          restoreLabel={restoreLabel}
        />
      </div>
      {maximized && (
        <div className="h-1/2 border-t border-border">
          <TimelineCharts
            chartData={chartData}
            maximized={false}
            onToggleMaximize={() => {}}
            maximizeLabel=""
            restoreLabel=""
            showMaximizeButton={false}
          />
        </div>
      )}
    </div>
  );
}

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
