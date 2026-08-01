import { useLocation } from "react-router-dom";
import { useLastRunStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";

export interface BreadcrumbSegment {
  /** Translated human-readable label */
  label: string;
  /** Route path for the link; undefined for the current (last) segment */
  to?: string;
}

/**
 * Derives breadcrumb segments from the current pathname via useLocation.
 * Compatible with BrowserRouter (does not require a data router).
 *
 * Segment → i18n-key mapping covers all known dashboard routes.
 * Add new entries to segmentKeyMap as routes are introduced in M3/M4.
 */
export function useDashboardBreadcrumb(): BreadcrumbSegment[] {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const lastRunId = useLastRunStore((s) => s.runId);
  const lastRunName = useLastRunStore((s) => s.name);

  const segmentKeyMap: Record<string, string> = {
    board: t("dashboard.breadcrumbBoard"),
    profile: t("dashboard.breadcrumbProfile"),
    simulation: t("dashboard.breadcrumbSimulation"),
    step: t("dashboard.breadcrumbStep"),
    configure: t("dashboard.breadcrumbConfigure"),
  };

  const parts = pathname.split("/").filter(Boolean);

  // Build cumulative paths: ["board"] → "/board", ["board","simulation"] → "/board/simulation"
  return parts.map((segment, index) => {
    const to = "/" + parts.slice(0, index + 1).join("/");
    const isLast = index === parts.length - 1;
    const mapped = segmentKeyMap[segment];
    let label = mapped ?? (segment.length > 12 ? segment.slice(0, 8) : segment);
    // The last-run's segment gets its human name (mockup: "Tablero › {run} › …").
    // Other runs keep the truncated id — no per-navigation fetch.
    if (mapped === undefined && segment === lastRunId) {
      label = `${lastRunName ?? t("simulationHistory.runNameFallback")} · ${segment.slice(0, 8)}`;
    }
    return {
      label,
      to: isLast ? undefined : to,
    };
  });
}
