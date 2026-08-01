import { List, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { type LastRunStatus, useLastRunStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

import type { SidebarPanel } from "@/shared/types/dashboard";

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

const RAIL_BUTTON_CLASS = cn(
  "flex size-8 items-center justify-center rounded-md",
  "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * DashboardSidebar — structural shell for the dashboard.
 *
 * Expanded (26rem, mockup 416px): section label + `panelContent` slot.
 * Collapsed (56px rail): three real buttons — new simulation, experiments,
 * and the last-run status dot — each un-collapses the sidebar. The
 * collapse/expand toggle itself lives in the header.
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastRunId = useLastRunStore((s) => s.runId);
  const lastRunStatus = useLastRunStore((s) => s.status);

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
          <nav aria-label={t("nav.board")} className="flex flex-col items-center gap-1 py-3">
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
            {lastRunId !== null && (
              <button
                type="button"
                aria-label={t("dashboard.runChipLast")}
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
            )}
          </nav>
        ) : (
          <>
            {/* Section label */}
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {activePanel === "new-simulation"
                  ? t("dashboard.sidebarNewSimulation")
                  : t("dashboard.sidebarMyExperiments")}
              </span>
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
