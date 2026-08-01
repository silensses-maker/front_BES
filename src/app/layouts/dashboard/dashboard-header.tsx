import { Maximize2, Minimize2, Moon, PanelLeft, PanelLeftClose, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useWsAuthState } from "@/shared/lib/ws-manager";
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
import { DashboardRunChip } from "./dashboard-run-chip";
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
  /** Whether the sidebar is collapsed to its rail */
  sidebarCollapsed: boolean;
  /** Toggles the sidebar collapsed state */
  onSidebarToggle: () => void;
}

const ICON_BUTTON_CLASS = cn(
  "flex size-8 items-center justify-center rounded-md",
  "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * DashboardHeader — top bar of the dashboard layout shell (56px).
 *
 * Left:   Logo (→ /home) · Breadcrumb (run-aware via the last-run store).
 * Center: Panel tabs ("New Simulation" / "My Experiments").
 * Right:  Run chip · WS reconnecting chip · theme toggle · fullscreen toggle ·
 *         sidebar collapse toggle · SettingsDropdown.
 */
export function DashboardHeader({
  activePanel,
  onPanelChange,
  fullscreen,
  onFullscreenToggle,
  sidebarCollapsed,
  onSidebarToggle,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const breadcrumbs = useDashboardBreadcrumb();
  const wsAuthState = useWsAuthState();
  const { resolvedTheme, setTheme } = useTheme();

  const FullscreenIcon = fullscreen ? Minimize2 : Maximize2;
  const SidebarIcon = sidebarCollapsed ? PanelLeft : PanelLeftClose;
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon;

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-background px-4 md:px-6">
      {/* ── Left slot: Logo + Separator + Breadcrumb ─────────── */}
      <div className="flex items-center gap-3">
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

      {/* ── Center: Panel tabs ────────────────────────────────── */}
      <nav aria-label={t("nav.board")} className="hidden items-center gap-1 md:flex">
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

      {/* ── Right slot ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <DashboardRunChip />

        {wsAuthState === "reconnecting" && (
          <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-sans text-xs text-muted-foreground">
            <span
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-destructive"
              aria-hidden="true"
            />
            {t("dashboard.wsReconnecting")}
          </span>
        )}

        {/* Theme toggle — quick light/dark swap; the 3-way radio (incl. system)
            remains available in SettingsDropdown */}
        <button
          type="button"
          aria-label={t("dashboard.themeToggle")}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className={ICON_BUTTON_CLASS}
        >
          <ThemeIcon className="size-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label={fullscreen ? t("dashboard.fullscreenExit") : t("dashboard.fullscreenEnter")}
          aria-pressed={fullscreen}
          onClick={onFullscreenToggle}
          className={ICON_BUTTON_CLASS}
        >
          <FullscreenIcon className="size-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label={
            sidebarCollapsed
              ? t("dashboard.sidebarToggleExpand")
              : t("dashboard.sidebarToggleCollapse")
          }
          aria-pressed={!sidebarCollapsed}
          onClick={onSidebarToggle}
          className={ICON_BUTTON_CLASS}
        >
          <SidebarIcon className="size-4" aria-hidden="true" />
        </button>

        <SettingsDropdown />
      </div>
    </header>
  );
}
