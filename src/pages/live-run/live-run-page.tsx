import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { TopologyResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { logger } from "@/shared/lib/logger";
import type { DashboardOutletContext } from "@/shared/types/dashboard";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { consensusSummary } from "./network-browser-lib";
import { NetworkSelectorWaiting } from "./network-selector";
import { NetworkSelectorPanel } from "./network-selector-panel";
import { RunView } from "./run-view";
import { useFinalSpreads } from "./use-final-spreads";
import { useNetworkConsensus } from "./use-network-consensus";

type LoadingState = "loading" | "waiting" | "selector" | "run-view" | "gone";

/**
 * LiveRunPage — smart connector for /board/simulation/:runId and
 *               /board/simulation/:runId/:networkId
 *
 * Responsibilities:
 * - Reads runId and (optional) networkId from URL params.
 * - On mount, calls listNetworks to decide which sub-state to render.
 * - "selector" state: owns the consensus polling + lazy dispersions and shows
 *   the networks browser in the sidebar + the "Selecciona una red" main state.
 * - "run-view" state: RunView owns everything (including its own sidebar).
 */
export function LiveRunPage() {
  const { t, i18n } = useTranslation();
  const { runId, networkId } = useParams<{ runId: string; networkId?: string }>();
  const navigate = useNavigate();
  const { setSidebarContent } = useOutletContext<DashboardOutletContext>();

  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [networkIds, setNetworkIds] = useState<string[]>([]);

  // Selector-state data owners (empty ids in every other state → both no-op)
  const selectorIds = loadingState === "selector" && runId ? networkIds : [];
  const consensusEntries = useNetworkConsensus(runId ?? "", selectorIds);
  const { finalSpreads, requestSpreads } = useFinalSpreads(runId ?? "");

  // First network's topology — feeds the Composición card and the browser's
  // agent counts (identical across a generated run's networks).
  const [selectorTopology, setSelectorTopology] = useState<TopologyResponse | null>(null);
  useEffect(() => {
    const firstId = selectorIds[0];
    if (!runId || firstId === undefined) return;
    if (selectorTopology !== null && selectorTopology.runId === runId) return;
    let cancelled = false;
    simulationsApi
      .getTopologyFull(runId, firstId)
      .then((topology) => {
        if (!cancelled && topology !== null) setSelectorTopology(topology);
      })
      .catch((err: unknown) => logger.error("LiveRunPage.selectorTopology", err));
    return () => {
      cancelled = true;
    };
  }, [runId, selectorIds, selectorTopology]);

  // Inject the sidebar panel for the pre-run states ("selector"/"waiting").
  // The run-view state owns its own sidebar injection (RunView → RunStatusPanel).
  useEffect(() => {
    if (!runId) return;
    if (loadingState !== "selector" && loadingState !== "waiting") return;

    setSidebarContent(
      loadingState === "selector" ? (
        <NetworkSelectorPanel
          runId={runId}
          networkIds={networkIds}
          consensus={consensusEntries}
          finalSpreads={finalSpreads}
          onVisibleNetworks={requestSpreads}
          topology={
            selectorTopology !== null && selectorTopology.runId === runId ? selectorTopology : null
          }
        />
      ) : (
        <Card className="m-3.5 flex flex-row items-center gap-2 p-4">
          <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-sans text-sm text-muted-foreground">
            {t("runView.waitingNetworks")}
          </span>
        </Card>
      ),
    );
    return () => setSidebarContent(null);
  }, [
    runId,
    loadingState,
    networkIds,
    consensusEntries,
    finalSpreads,
    requestSpreads,
    selectorTopology,
    setSidebarContent,
    t,
  ]);

  // Mount-time network discovery — skip when networkId is already in URL
  useEffect(() => {
    if (!runId) return;

    if (networkId) {
      setLoadingState("run-view");
      return;
    }

    let cancelled = false;

    const discover = async () => {
      try {
        const { networks } = await simulationsApi.listNetworks(runId);
        if (cancelled) return;

        if (networks.length === 1) {
          // Single network — redirect immediately (replace so back button skips this)
          navigate(`/board/simulation/${runId}/${networks[0]}`, { replace: true });
          return;
        }
        if (networks.length > 1) {
          setNetworkIds(networks);
          setLoadingState("selector");
          return;
        }

        // Empty network list: for a RUNNING run the networks are not created
        // yet (wait for topology_ready); for a finished run it means the
        // backend no longer retains them (cache/retention expired) — waiting
        // would spin forever, so surface the honest "gone" state instead.
        try {
          const run = await simulationsApi.getById(runId);
          if (cancelled) return;
          setLoadingState(run.status === "running" ? "waiting" : "gone");
        } catch (err) {
          if (cancelled) return;
          logger.error("LiveRunPage.getById", err);
          // 404 = run no longer trackable (e.g. saveMode without DB writes)
          setLoadingState("gone");
        }
      } catch (err) {
        if (cancelled) return;
        logger.error("LiveRunPage.listNetworks", err);
        // On error, fall through to waiting mode — WS will deliver topology_ready
        setLoadingState("waiting");
      }
    };

    discover();

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

  if (loadingState === "gone") {
    // Finished run whose networks the backend no longer retains (or a run
    // whose saveMode never wrote to DB) — an honest terminal state instead of
    // the infinite "waiting for topology" spinner.
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <div
          aria-hidden="true"
          className="mb-2 flex size-12 items-center justify-center rounded-full bg-warn/15 text-lg text-warn"
        >
          !
        </div>
        <p className="font-sans text-base font-semibold text-foreground">
          {t("runView.runDataGoneTitle")}
        </p>
        <p className="max-w-95 font-sans text-[13px] text-muted-foreground">
          {t("runView.runDataGoneBody")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => navigate("/board/experiments")}
        >
          {t("runView.backToBoard")}
        </Button>
      </div>
    );
  }

  if (loadingState === "selector") {
    // Mockup "Selecciona una red": browser lives in the sidebar; the main area
    // shows the ◌ empty state + the consensus summary pill.
    const summary = consensusSummary(
      networkIds.map((id, i) => ({
        ordinal: i + 1,
        networkId: id,
        status: consensusEntries[id]?.status ?? "pending",
        finalRound: consensusEntries[id]?.finalRound ?? null,
      })),
    );
    const fmt = (n: number) => formatNumber(n, i18n.language);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <div
          aria-hidden="true"
          className="mb-2 flex size-12 items-center justify-center rounded-full border border-dashed border-muted-foreground text-lg text-muted-foreground"
        >
          ◌
        </div>
        <p className="font-sans text-base font-semibold text-foreground">
          {t("runView.selectNetworkTitle")}
        </p>
        <p className="font-sans text-[13px] text-muted-foreground">
          {t("runView.selectNetworkBody", { count: fmt(networkIds.length) })}
        </p>
        <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 font-sans text-[12.5px]">
          <span className="size-2 flex-none rounded-[2px] bg-ok" aria-hidden="true" />
          {t("runView.networksSummaryShort", {
            n: fmt(summary.consensus),
            m: fmt(summary.total),
            pct: summary.pct,
          })}
        </div>
      </div>
    );
  }

  // loadingState === "run-view" — networkId is guaranteed present here
  return <RunView runId={runId} networkId={networkId!} />;
}
