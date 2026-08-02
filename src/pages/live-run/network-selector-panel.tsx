import { useNavigate } from "react-router-dom";
import { NetworkCompositionCard } from "@/features/simulation-stream";
import type { TopologyResponse } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { NetworkBrowser } from "./network-browser";
import type { NetworkConsensusEntry } from "./use-network-consensus";

interface NetworkSelectorPanelProps {
  runId: string;
  networkIds: string[];
  consensus: Record<string, NetworkConsensusEntry | undefined>;
  finalSpreads: Record<string, number>;
  onVisibleNetworks: (networkIds: string[]) => void;
  /** First network's topology — feeds Composición (shared across a generated run). */
  topology: TopologyResponse | null;
}

function InfoRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}

/**
 * "Ejecución en vivo" sidebar for a multi-network run BEFORE a network is
 * chosen (mockup: sideRun with redSel == null): open networks browser, Red
 * card with dashes + "Sin seleccionar", Composición (from the first network's
 * topology — identical across a generated run) and the back-to-board footer.
 */
export function NetworkSelectorPanel({
  runId,
  networkIds,
  consensus,
  finalSpreads,
  onVisibleNetworks,
  topology,
}: NetworkSelectorPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3.5">
          <NetworkBrowser
            runId={runId}
            networkIds={networkIds}
            currentNetworkId={null}
            consensus={consensus}
            finalSpreads={finalSpreads}
            onVisibleNetworks={onVisibleNetworks}
            agentCount={topology?.agentCount ?? null}
            defaultOpen
          />

          {/* ── Red card (mockup: dashes + "Sin seleccionar") ── */}
          <Card className="gap-0 rounded-[10px] px-3.5 py-3">
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("runView.networkCardTitle")}
            </p>
            <InfoRow label={t("runView.networkAgents")} value="—" />
            <InfoRow label={t("runView.networkEdges")} value="—" />
            <InfoRow
              label={t("runView.networkCardTitle")}
              value={t("runView.networkUnselected")}
              mono={false}
            />
          </Card>

          {/* ── Composición (first network's topology) ────────── */}
          {topology !== null && <NetworkCompositionCard topology={topology} />}
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/board/experiments")}
        >
          {t("runView.backToBoard")}
        </Button>
      </div>
    </div>
  );
}
