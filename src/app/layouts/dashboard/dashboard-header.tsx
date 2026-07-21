import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb";
import { Logo } from "@/shared/ui/logo";
import { Separator } from "@/shared/ui/separator";
import { SettingsDropdown } from "@/widgets/settings-dropdown";
import type { SidebarPanel } from "./dashboard-sidebar";
import { useDashboardBreadcrumb } from "./use-dashboard-breadcrumb";

interface DashboardHeaderProps {
  /** Currently active sidebar panel */
  activePanel: SidebarPanel;
  /** Called when a header tab is clicked; signals the sidebar what to render */
  onPanelChange: (panel: SidebarPanel) => void;
  /** Whether the main content is currently in fullscreen/sidebar-hidden mode */
  fullscreen: boolean;
  /** Toggles fullscreen mode on/off */
  onFullscreenToggle: () => void;
}

/**
 * DashboardHeader — top bar of the dashboard layout shell.
 *
 * Left side:  Logo (links to /) → vertical separator → Breadcrumb (auto-built
 *             from current route via useDashboardBreadcrumb)
 * Center:     Navigation tabs ("New Simulation" / "My Experiments") that signal
 *             the sidebar what panel to render.
 * Right side: Fullscreen toggle + existing SettingsDropdown.
 *
 * Placement: app/layouts/dashboard — structural shell, no business logic.
 */
export function DashboardHeader({
  activePanel,
  onPanelChange,
  fullscreen,
  onFullscreenToggle,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const breadcrumbs = useDashboardBreadcrumb();

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-background px-4 md:px-6">
      {/* ── Left slot: Logo + Separator + Breadcrumb ─────────── */}
      <div className="flex items-center gap-3">
        {/* Logo — links to public landing */}
        <Link
          to="/home"
          aria-label={t("dashboard.logoHomeLink")}
          className="flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo className="h-7 w-7" aria-hidden="true" />
        </Link>

        <Separator orientation="vertical" className="h-5" />

        {/* Auto-built breadcrumb from current route */}
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((segment, index) => (
              <React.Fragment key={segment.to ?? `current-${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {segment.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={segment.to}>{segment.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* ── Center: Action tabs ───────────────────────────────── */}
      <nav
        aria-label={t("dashboard.tabNewSimulation")}
        className="hidden items-center gap-1 md:flex"
      >
        {(
          [
            {
              panel: "new-simulation" as const,
              label: t("dashboard.tabNewSimulation"),
            },
            {
              panel: "my-experiments" as const,
              label: t("dashboard.tabMyExperiments"),
            },
          ] satisfies Array<{ panel: SidebarPanel; label: string }>
        ).map(({ panel, label }) => (
          <button
            key={panel}
            type="button"
            aria-pressed={activePanel === panel}
            onClick={() => onPanelChange(panel)}
            className={cn(
              "rounded-md px-3 py-1.5 font-sans text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activePanel === panel
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Right slot: Fullscreen toggle + Settings ─────────── */}
      <div className="flex items-center gap-2">
        {/* Fullscreen / sidebar-hidden toggle */}
        <button
          type="button"
          aria-label={fullscreen ? t("dashboard.fullscreenExit") : t("dashboard.fullscreenEnter")}
          aria-pressed={fullscreen}
          onClick={onFullscreenToggle}
          className={cn(
            "flex size-8 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {fullscreen ? (
            /* Minimize icon */
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
              aria-hidden="true"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="10" y1="14" x2="3" y2="21" />
              <line x1="21" y1="3" x2="14" y2="10" />
            </svg>
          ) : (
            /* Maximize icon */
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
              aria-hidden="true"
            >
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>

        <SettingsDropdown />
      </div>
    </header>
  );
}
