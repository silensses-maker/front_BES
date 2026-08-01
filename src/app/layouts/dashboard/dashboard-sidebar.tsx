import { ChevronLeft, List, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { type LastRunStatus, useLastRunStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { SidebarPanel } from "@/shared/types/dashboard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export type { SidebarPanel };

interface DashboardSidebarProps {
  /** Whether the sidebar is in the collapsed (rail) state */
  collapsed: boolean;
  /** The panel whose content should be rendered */
  activePanel: SidebarPanel;
  /** Callback to toggle collapsed state */
  onToggle: () => void;
  /** Switches the active panel (rail buttons) */
  onPanelChange: (panel: SidebarPanel) => void;
  /**
   * Content to render inside the panel body.
   * Provided by the page layer (BoardPage) via DashboardLayout.
   * When undefined the sidebar renders the placeholder text.
   */
  panelContent?: ReactNode;
}

const RAIL_DOT_CLASS: Record<LastRunStatus, string> = {
  running: "bg-primary animate-pulse",
  completed: "bg-muted-foreground",
  cancelled: "bg-muted-foreground",
  error: "bg-destructive",
};

const STATUS_LABEL_KEY = {
  running: "simulationHistory.statusRunning",
  completed: "simulationHistory.statusCompleted",
  cancelled: "simulationHistory.statusCancelled",
  error: "simulationHistory.statusError",
} as const;

const RAIL_BUTTON_CLASS = cn(
  "flex size-9 items-center justify-center rounded-md border border-border bg-card",
  "text-muted-foreground transition-colors hover:border-primary hover:text-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * DashboardSidebar — structural shell for the dashboard.
 *
 * Expanded (w-sidebar token): section title + inline "‹" collapse button +
 * `panelContent` slot. Collapsed (56px rail): three real buttons with
 * tooltips — new simulation, experiments, and the last-run status dot — each
 * un-collapses the sidebar. The header's panel toggle also expands/collapses.
 *
 * Motion rule (design-system.md): sidebar toggle uses transition-width only,
 * no layout animation with motion/react.
 */
export function DashboardSidebar({
  collapsed,
  activePanel,
  onToggle,
  onPanelChange,
  panelContent,
}: DashboardSidebarProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lastRunId = useLastRunStore((s) => s.runId);
  const lastRunStatus = useLastRunStore((s) => s.status);
  const lastRunRound = useLastRunStore((s) => s.round);

  // Mockup rail tooltip: "Ejecución: {estado}[ · Ronda N]"
  const railRunStatusLabel =
    lastRunStatus === "running"
      ? t("dashboard.runChipRunning", { round: lastRunRound.toLocaleString(i18n.language) })
      : t(STATUS_LABEL_KEY[lastRunStatus]);
  const railRunTip = t("dashboard.railRunTip", { status: railRunStatusLabel });

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "relative flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-sidebar",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {collapsed ? (
          /* ── Collapsed rail: real navigation buttons ─────────── */
          <nav aria-label={t("nav.board")} className="flex flex-col items-center gap-2 py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("dashboard.tabNewSimulation")}
                  onClick={() => {
                    onPanelChange("new-simulation");
                    onToggle();
                  }}
                  className={RAIL_BUTTON_CLASS}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{t("dashboard.tabNewSimulation")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("dashboard.tabMyExperiments")}
                  onClick={() => {
                    onPanelChange("my-experiments");
                    onToggle();
                  }}
                  className={RAIL_BUTTON_CLASS}
                >
                  <List className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{t("dashboard.tabMyExperiments")}</p>
              </TooltipContent>
            </Tooltip>
            {lastRunId !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={railRunTip}
                    onClick={() => {
                      navigate(`/board/simulation/${lastRunId}`);
                      onToggle();
                    }}
                    className={RAIL_BUTTON_CLASS}
                  >
                    <span
                      className={cn("size-2 rounded-full", RAIL_DOT_CLASS[lastRunStatus])}
                      aria-hidden="true"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">{railRunTip}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </nav>
        ) : (
          <>
            {/* Section header: title + inline collapse button (mockup "‹") */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {activePanel === "new-simulation"
                  ? t("dashboard.sidebarNewSimulation")
                  : t("dashboard.sidebarMyExperiments")}
              </span>
              <button
                type="button"
                aria-label={t("dashboard.sidebarToggleCollapse")}
                onClick={onToggle}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md border border-border bg-card",
                  "text-muted-foreground transition-colors hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {panelContent != null ? (
                panelContent
              ) : (
                <p className="px-4 py-2 font-sans text-sm text-muted-foreground">
                  {t("dashboard.sidebarPlaceholder")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
