import type { ReactNode } from "react";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

/** Which top-level panel the sidebar should render */
export type SidebarPanel = "new-simulation" | "my-experiments";

interface DashboardSidebarProps {
  /** Whether the sidebar is in the collapsed (icon-only) state */
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

/**
 * DashboardSidebar — structural shell for the dashboard.
 *
 * Contains:
 *  - A collapse/expand toggle button (keyboard accessible, aria-expanded).
 *  - Two named panel areas driven by `activePanel`.
 *  - A `panelContent` slot: when provided, replaces the placeholder with real UI.
 *
 * Placement: app/layouts/dashboard — layout component that uses no widgets
 * and is consumed only by DashboardLayout at the app layer.
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

  return (
    <aside
      aria-label={
        collapsed ? t("dashboard.sidebarToggleExpand") : t("dashboard.sidebarToggleCollapse")
      }
      aria-expanded={!collapsed}
      data-collapsed={collapsed}
      className={cn(
        "relative flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-xl",
      )}
    >
      {/* ── Toggle button ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={
          collapsed ? t("dashboard.sidebarToggleExpand") : t("dashboard.sidebarToggleCollapse")
        }
        className={cn(
          "absolute -right-3 top-4 z-10",
          "flex size-6 items-center justify-center",
          "rounded-full border border-border bg-background shadow-sm",
          "text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* Chevron rotates 180° when sidebar is collapsed */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn("transition-transform duration-200", collapsed ? "rotate-180" : "rotate-0")}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* ── Panel content area ────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Section label — hidden when collapsed */}
        {!collapsed && (
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {activePanel === "new-simulation"
                ? t("dashboard.sidebarNewSimulation")
                : t("dashboard.sidebarMyExperiments")}
            </span>
          </div>
        )}

        <div
          className={cn("min-h-0 flex-1", collapsed && "flex items-start justify-center px-0 py-3")}
        >
          {collapsed ? (
            /* Icon placeholder in collapsed state */
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center text-muted-foreground"
            >
              {activePanel === "new-simulation" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              )}
            </span>
          ) : panelContent != null ? (
            panelContent
          ) : (
            /* Fallback placeholder when no content injected */
            <p className="px-4 py-2 font-sans text-sm text-muted-foreground">
              {t("dashboard.sidebarPlaceholder")}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
