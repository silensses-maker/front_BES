import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";
import type { NetworkConsensusStatus } from "./use-network-consensus";
import { useNetworkConsensus } from "./use-network-consensus";

const CONSENSUS_DOT: Record<NetworkConsensusStatus, string> = {
  pending: "bg-muted-foreground animate-pulse",
  consensus: "bg-green-500",
  "no-consensus": "bg-amber-500",
};

const CONSENSUS_LABEL_KEY: Record<NetworkConsensusStatus, string> = {
  pending: "liveRun.networkPanel.consensusPending",
  consensus: "liveRun.networkPanel.consensusReached",
  "no-consensus": "liveRun.networkPanel.consensusNotReached",
};

interface NetworkListPanelProps {
  runId: string;
  networkIds: string[];
}

export function NetworkListPanel({ runId, networkIds }: NetworkListPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const consensus = useNetworkConsensus(runId, networkIds);
  const consensusCount = networkIds.filter((id) => consensus[id]?.status === "consensus").length;

  if (networkIds.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-4">
        <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="font-sans text-sm text-muted-foreground">
          {t("liveRun.networkPanel.waiting")}
        </span>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="font-sans text-xs font-medium text-muted-foreground">
        {t("liveRun.networkPanel.title")}
      </p>
      <div className="flex flex-col gap-0.5">
        {networkIds.map((id, index) => {
          const status = consensus[id]?.status ?? "pending";
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-between gap-2 px-2 py-1.5"
              onClick={() => navigate(`/board/simulation/${runId}/${id}`)}
            >
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", CONSENSUS_DOT[status])} />
                <span className="font-sans text-sm">
                  {t("liveRun.networkPanel.network", { index: String(index + 1) })}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-sans text-xs text-muted-foreground">
                  {t(CONSENSUS_LABEL_KEY[status] as Parameters<typeof t>[0])}
                </span>
                <span className="font-mono text-xs text-muted-foreground/60">…{id.slice(-8)}</span>
              </span>
            </Button>
          );
        })}
      </div>
      <Separator />
      <p className="font-sans text-xs text-muted-foreground">
        {t("liveRun.networkPanel.summary", {
          count: String(consensusCount),
          total: String(networkIds.length),
        })}
      </p>
    </Card>
  );
}
