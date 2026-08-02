import { Maximize2, Minimize2, Moon, PanelLeft, PanelLeftClose, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useWsAuthState } from "@/shared/lib/ws-manager";
import type { SidebarPanel } from "@/shared/types/dashboard";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { SettingsDropdown } from "@/widgets/settings-dropdown";
import { DashboardRunChip } from "./dashboard-run-chip";
import { type BreadcrumbSegment, useDashboardBreadcrumb } from "./use-dashboard-breadcrumb";

interface DashboardHeaderProps {
  /** Navigates to the clicked panel's route (the panel lives in the URL) */
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

/** Mono id chip used by the breadcrumb (mockup: run id / network id). */
function CrumbChip({ chip }: { chip: NonNullable<BreadcrumbSegment["chip"]> }) {
  const body = (
    <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {chip.text}
    </span>
  );
  if (!chip.tooltip) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-mono text-xs">{chip.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * DashboardHeader — top bar of the dashboard layout shell (56px).
 *
 * Left:   Logo (→ board) · Breadcrumb `Tablero › {run · id} › {red}`.
 * Center: Segmented panel tabs (inactive while inside a run, per mockup).
 * Right:  Run chip · WS reconnecting chip · theme toggle · fullscreen toggle ·
 *         sidebar collapse toggle · SettingsDropdown.
 */
export function DashboardHeader({
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
  const { pathname } = useLocation();

  const FullscreenIcon = fullscreen ? Minimize2 : Maximize2;
  const SidebarIcon = sidebarCollapsed ? PanelLeft : PanelLeftClose;
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon;

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-background px-4 md:px-6">
      {/* ── Left slot: Logo + Separator + Breadcrumb ─────────── */}
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/board"
              aria-label={t("dashboard.breadcrumbBoard")}
              className="flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo className="h-7 w-7" aria-hidden="true" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{t("dashboard.breadcrumbBoard")}</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5" />

        {/* Auto-built breadcrumb from current route */}
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumbs.map((segment, index) => {
              const content = (
                <span className="flex min-w-0 items-center gap-1.5">
                  {segment.label !== "" && (
                    <span
                      className={cn(
                        "truncate",
                        segment.chip && "max-w-55 font-semibold text-foreground",
                      )}
                    >
                      {segment.label}
                    </span>
                  )}
                  {segment.chip && <CrumbChip chip={segment.chip} />}
                </span>
              );
              return (
                <React.Fragment key={segment.to ?? `current-${index}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="min-w-0">
                    {segment.to ? (
                      <BreadcrumbLink asChild>
                        <Link to={segment.to}>{content}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="min-w-0">{content}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* ── Center: Segmented panel tabs ──────────────────────────
          Absolutely centered so breadcrumb/chip width changes on the
          sides never shift the tabs. */}
      <nav
        aria-label={t("nav.board")}
        className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5 md:flex"
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
        ).map(({ panel, label }) => {
          // URL-driven: active only on that panel's route — run routes and
          // /profile leave both tabs inactive (mockup behavior)
          const active =
            (panel === "new-simulation" && pathname.startsWith("/board/new-simulation")) ||
            (panel === "my-experiments" && pathname.startsWith("/board/experiments"));
          return (
            <button
              key={panel}
              type="button"
              aria-pressed={active}
              // The panel lives in the URL — onPanelChange navigates to it,
              // which also leaves a run view (mockup goNueva/goExp)
              onClick={() => onPanelChange(panel)}
              className={cn(
                "rounded-md px-3 py-1 font-sans text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-background font-semibold text-foreground ring-1 ring-inset ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* ── Right slot ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <DashboardRunChip />

        {wsAuthState === "reconnecting" && (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1 font-sans text-xs text-warn">
            <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
            {t("dashboard.wsReconnecting")}
          </span>
        )}

        {/* Theme toggle — quick light/dark swap; the 3-way radio (incl. system)
            remains available in SettingsDropdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("dashboard.themeToggle")}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className={ICON_BUTTON_CLASS}
            >
              <ThemeIcon className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{t("dashboard.themeToggle")}</p>
          </TooltipContent>
        </Tooltip>

        <button
          type="button"
          aria-label={fullscreen ? t("dashboard.fullscreenExit") : t("dashboard.fullscreenEnter")}
          aria-pressed={fullscreen}
          onClick={onFullscreenToggle}
          className={ICON_BUTTON_CLASS}
        >
          <FullscreenIcon className="size-4" aria-hidden="true" />
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{t("dashboard.sidebarToggleHint")}</p>
          </TooltipContent>
        </Tooltip>

        <SettingsDropdown />
      </div>
    </header>
  );
}
