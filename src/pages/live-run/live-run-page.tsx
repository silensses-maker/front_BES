import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ReplayDock } from "@/features/simulation-replay";
import { RunStatusPanel, SimulationRunView } from "@/features/simulation-stream";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import type { DashboardOutletContext } from "@/shared/types/dashboard";
import { NetworkListPanel } from "./network-list-panel";
import { NetworkSelectorWaiting } from "./network-selector";

type LoadingState = "loading" | "waiting" | "selector" | "run-view";

/**
 * LiveRunPage — smart connector for /board/simulation/:runId and
 *               /board/simulation/:runId/:networkId
 *
 * Responsibilities:
 * - Reads runId and (optional) networkId from URL params.
 * - On mount, calls listNetworks to decide which sub-state to render.
 * - Injects the appropriate sidebar panel into the dashboard slot:
 *   - "selector" state → NetworkListPanel (pick a network)
 *   - all other states → RunStatusPanel (simulation status)
 * - Passes data down; does not let children read the store directly
 *   (except RunStatusPanel, which is explicitly allowed as a status primitive
 *   consumed by the layout's sidebar slot).
 */
export function LiveRunPage() {
  const { t } = useTranslation();
  const { runId, networkId } = useParams<{ runId: string; networkId?: string }>();
  const navigate = useNavigate();
  const { setSidebarContent } = useOutletContext<DashboardOutletContext>();

  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [networkIds, setNetworkIds] = useState<string[]>([]);

  // Inject the right sidebar panel whenever state or network list changes.
  // "selector" shows the network list to pick from; all other states show
  // the simulation status panel.
  useEffect(() => {
    if (!runId) return;

    const content =
      loadingState === "selector" ? (
        <NetworkListPanel runId={runId} networkIds={networkIds} />
      ) : loadingState === "waiting" ? (
        <NetworkListPanel runId={runId} networkIds={[]} />
      ) : (
        <RunStatusPanel runId={runId} />
      );

    setSidebarContent(content);
    return () => setSidebarContent(null);
  }, [runId, loadingState, networkIds, setSidebarContent]);

  // Mount-time network discovery — skip when networkId is already in URL
  useEffect(() => {
    if (!runId) return;

    if (networkId) {
      setLoadingState("run-view");
      return;
    }

    let cancelled = false;

    simulationsApi
      .listNetworks(runId)
      .then(({ networks }) => {
        if (cancelled) return;

        if (networks.length === 0) {
          setLoadingState("waiting");
        } else if (networks.length === 1) {
          // Single network — redirect immediately (replace so back button skips this)
          navigate(`/board/simulation/${runId}/${networks[0]}`, { replace: true });
        } else {
          setNetworkIds(networks);
          setLoadingState("selector");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error("LiveRunPage.listNetworks", err);
        // On error, fall through to waiting mode — WS will deliver topology_ready
        setLoadingState("waiting");
      });

    return () => {
      cancelled = true;
    };
  }, [runId, networkId, navigate]);

  if (!runId) {
    // Should never happen given the route definition, but satisfies strict null checks
    return null;
  }

  if (loadingState === "loading") {
    return null;
  }

  if (loadingState === "waiting") {
    // NetworkSelectorWaiting owns the WS connection in this state — keep it
    // mounted so topology_ready auto-navigates when the first network arrives.
    return <NetworkSelectorWaiting runId={runId} />;
  }

  if (loadingState === "selector") {
    // Network list lives in the sidebar; main area shows a guidance message.
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-sans text-base font-medium text-foreground">
          {t("liveRun.selector.title")}
        </p>
        <p className="font-sans text-sm text-muted-foreground">
          {t("liveRun.selector.description")}
        </p>
      </div>
    );
  }

  // loadingState === "run-view" — networkId is guaranteed present here
  return (
    <SimulationRunView
      runId={runId}
      networkId={networkId!}
      replaySlot={<ReplayDock runId={runId} networkId={networkId!} />}
    />
  );
}
