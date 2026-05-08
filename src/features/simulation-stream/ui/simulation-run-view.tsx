import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { SimulationCanvas } from "@/features/simulation-canvas";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import { useSimulationStream } from "../model/use-simulation-stream";

const PANEL_DEFAULTS = {
  a: 25,
  right: 75,
  b: 70,
  c: 30,
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

  const panelARef = useRef<PanelImperativeHandle | null>(null);
  const panelRightRef = useRef<PanelImperativeHandle | null>(null);
  const panelBRef = useRef<PanelImperativeHandle | null>(null);
  const panelCRef = useRef<PanelImperativeHandle | null>(null);

  const [maximized, setMaximized] = useState<MaximizedPanel>(null);

  const handleMaximize = useCallback(
    (target: "a" | "b" | "c") => {
      if (maximized === target) {
        if (target === "a") {
          panelRightRef.current?.expand();
        } else if (target === "b") {
          panelARef.current?.expand();
          panelCRef.current?.expand();
        } else {
          panelARef.current?.expand();
          panelBRef.current?.expand();
        }
        setMaximized(null);
        return;
      }

      if (target === "a") {
        panelRightRef.current?.collapse();
      } else if (target === "b") {
        panelARef.current?.collapse();
        panelCRef.current?.collapse();
      } else {
        panelARef.current?.collapse();
        panelBRef.current?.collapse();
      }
      setMaximized(target);
    },
    [maximized],
  );

  return (
    <div className="flex h-full flex-col p-4">
      {/* Three-panel resizable layout */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            panelRef={panelARef}
            id="panel-a"
            defaultSize={PANEL_DEFAULTS.a}
            minSize={15}
            collapsible
            collapsedSize={0}
          >
            <PanelPlaceholder
              label={t("simulation.panelStatistical")}
              maximized={maximized === "a"}
              onToggleMaximize={() => handleMaximize("a")}
              maximizeLabel={t("simulation.maximizePanel")}
              restoreLabel={t("simulation.restorePanel")}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            panelRef={panelRightRef}
            id="panel-right"
            defaultSize={PANEL_DEFAULTS.right}
            minSize={30}
            collapsible
            collapsedSize={0}
          >
            <ResizablePanelGroup orientation="vertical">
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

              <ResizableHandle withHandle />

              <ResizablePanel
                panelRef={panelCRef}
                id="panel-c"
                defaultSize={PANEL_DEFAULTS.c}
                minSize={15}
                collapsible
                collapsedSize={0}
              >
                <PanelPlaceholder
                  label={t("simulation.panelLiveCharts")}
                  maximized={maximized === "c"}
                  onToggleMaximize={() => handleMaximize("c")}
                  maximizeLabel={t("simulation.maximizePanel")}
                  restoreLabel={t("simulation.restorePanel")}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PanelPlaceholderProps {
  label: string;
  maximized: boolean;
  onToggleMaximize: () => void;
  maximizeLabel: string;
  restoreLabel: string;
}

function PanelPlaceholder({
  label,
  maximized,
  onToggleMaximize,
  maximizeLabel,
  restoreLabel,
}: PanelPlaceholderProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-muted/20">
      <p className="font-sans text-sm text-muted-foreground">{label}</p>
      <MaximizeButton
        maximized={maximized}
        onClick={onToggleMaximize}
        maximizeLabel={maximizeLabel}
        restoreLabel={restoreLabel}
      />
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
