import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLastRunStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

export interface BreadcrumbSegment {
  /** Translated human-readable label ("" when only the chip should render) */
  label: string;
  /** Route path for the link; undefined for the current (last) segment */
  to?: string;
  /** Mono id chip rendered after the label (mockup: run id / network id) */
  chip?: { text: string; tooltip?: string };
}

/**
 * Derives breadcrumb segments from the current pathname via useLocation.
 * Compatible with BrowserRouter (does not require a data router).
 *
 * Run routes follow the mockup shape `Tablero › {name} {id-chip} › {network}`:
 * the structural "simulation" path segment is not rendered; the run segment
 * carries the human name (last-run store fast path, otherwise fetched once per
 * mount via getById) plus a mono id chip whose tooltip reveals the full run
 * id. The network segment renders as a mono chip with the truncated id until
 * #112 gives networks their "Red N" identity.
 */
export function useDashboardBreadcrumb(): BreadcrumbSegment[] {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const lastRunId = useLastRunStore((s) => s.runId);
  const lastRunName = useLastRunStore((s) => s.name);
  // runId → fetched name (null = run has no name; absent = not fetched yet)
  const [fetchedNames, setFetchedNames] = useState<Record<string, string | null>>({});

  const parts = pathname.split("/").filter(Boolean);
  const isRunRoute = parts[0] === "board" && parts[1] === "simulation" && parts.length >= 3;
  const routeRunId = isRunRoute ? (parts[2] ?? null) : null;

  // Resolve the run name for runs other than the tracked last-run.
  useEffect(() => {
    if (routeRunId === null || routeRunId === lastRunId) return;
    if (routeRunId in fetchedNames) return;
    let cancelled = false;
    simulationsApi
      .getById(routeRunId)
      .then((run) => {
        if (cancelled) return;
        setFetchedNames((prev) => ({ ...prev, [routeRunId]: run.name }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error("useDashboardBreadcrumb.getById", err);
        setFetchedNames((prev) => ({ ...prev, [routeRunId]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [routeRunId, lastRunId, fetchedNames]);

  const segmentKeyMap: Record<string, string> = {
    board: t("dashboard.breadcrumbBoard"),
    profile: t("dashboard.breadcrumbProfile"),
    simulation: t("dashboard.breadcrumbSimulation"),
    step: t("dashboard.breadcrumbStep"),
    configure: t("dashboard.breadcrumbConfigure"),
  };

  const segments: BreadcrumbSegment[] = [];
  parts.forEach((segment, index) => {
    // Mockup breadcrumb goes `Tablero › {run}` — the "simulation" path
    // segment is structural and not shown.
    if (isRunRoute && index === 1) return;

    const to = "/" + parts.slice(0, index + 1).join("/");
    const isLast = index === parts.length - 1;
    const mapped = segmentKeyMap[segment];

    if (isRunRoute && index === 2) {
      // undefined = name unknown (still loading) · null = run has no name
      let name: string | null | undefined;
      if (segment === lastRunId) {
        name = lastRunName;
      } else if (segment in fetchedNames) {
        name = fetchedNames[segment] ?? null;
      }
      segments.push({
        label: name === undefined ? "" : (name ?? t("simulationHistory.runNameFallback")),
        to: isLast ? undefined : to,
        chip: {
          text: segment.slice(0, 8),
          tooltip: `${t("dashboard.breadcrumbFullRunId")}: ${segment}`,
        },
      });
      return;
    }

    if (isRunRoute && index === 3) {
      // Network segment — chip with the truncated opaque id ("Red N" in #112)
      segments.push({
        label: "",
        to: isLast ? undefined : to,
        chip: { text: segment.slice(0, 8) },
      });
      return;
    }

    segments.push({
      label: mapped ?? (segment.length > 12 ? segment.slice(0, 8) : segment),
      to: isLast ? undefined : to,
    });
  });

  return segments;
}
