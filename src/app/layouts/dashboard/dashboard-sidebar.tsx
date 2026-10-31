import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
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
  /**
   * Content to render inside the panel body.
   * Provided by the page layer (BoardPage) via DashboardLayout.
   * When undefined the sidebar renders the placeholder text.
   */
  panelContent?: ReactNode;
}

const RAIL_BUTTON_CLASS = cn(
  "flex size-9 items-center justify-center rounded-md border border-border bg-card",
  "text-muted-foreground transition-colors hover:border-primary hover:text-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * DashboardSidebar — structural shell for the dashboard.
 *
 * Expanded (w-sidebar token): section title + inline "‹" collapse button +
 * `panelContent` slot. Collapsed (56px rail): a single "›" button that expands it again.
 * The mockup's rail had three more buttons (new simulation, experiments, last run); they were
 * dropped on 2026-10-31 as duplicates of the header's panel tabs and run chip (deliberate
 * deviation, see the bitácora). The header's panel toggle also expands/collapses.
 *
 * Motion rule (design-system.md): sidebar toggle uses transition-width only,
 * no layout animation with motion/react.
 */
export function DashboardSidebar({
  collapsed,
  activePanel,
  onToggle,
  panelContent,
}: DashboardSidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Mockup sideTitle: run routes show "Ejecución en vivo" instead of the tab name
  const isRunRoute = pathname.startsWith("/board/simulation/");

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
          /* ── Collapsed rail: only the way back to the expanded panel ── */
          <div className="flex flex-col items-center py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("dashboard.sidebarToggleExpand")}
                  onClick={onToggle}
                  className={RAIL_BUTTON_CLASS}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{t("dashboard.sidebarToggleExpand")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {/* Section header: title + inline collapse button (mockup "‹") */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {isRunRoute
                  ? t("dashboard.sidebarLiveRun")
                  : activePanel === "new-simulation"
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
