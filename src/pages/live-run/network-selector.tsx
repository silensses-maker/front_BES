import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSimulationStore } from "@/entities/simulation";
import { useSimulationStream } from "@/features/simulation-stream";
import { useTranslation } from "@/shared/i18n";

// ─── Waiting mode (0 networks) ────────────────────────────────────────────────

interface NetworkSelectorWaitingProps {
  runId: string;
}

/**
 * Renders a spinner while waiting for the first topology_ready event.
 * Connects the WS with networkId=null so any topology_ready triggers
 * navigation. The parent must keep this component mounted.
 */
export function NetworkSelectorWaiting({ runId }: NetworkSelectorWaitingProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Connect WS — networkId is null so we accept any topology_ready
  useSimulationStream(runId, null);

  // When topology lands in the store we get the networkId to navigate to
  const topology = useSimulationStore((s) => s.topology);

  useEffect(() => {
    if (topology?.networkId) {
      navigate(`/board/simulation/${runId}/${topology.networkId}`, { replace: true });
    }
  }, [topology, runId, navigate]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {/* Spinner */}
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        role="status"
        aria-label={t("liveRun.networkSelector.waitingTitle")}
      />
      <p className="font-sans text-base font-medium text-foreground">
        {t("liveRun.networkSelector.waitingTitle")}
      </p>
      <p className="font-sans text-sm text-muted-foreground">
        {t("liveRun.networkSelector.waitingDescription")}
      </p>
    </div>
  );
}
