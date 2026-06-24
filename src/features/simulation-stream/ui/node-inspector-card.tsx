import { X } from "lucide-react";
import { useSimulationStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EdgeRowProps {
  label: string;
  influence: number;
  bias: number;
  biasLabel: string;
  isSelf?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 font-sans text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function EdgeRow({ label, influence, bias, biasLabel, isSelf }: EdgeRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={cn(
          "shrink-0 truncate font-sans text-xs",
          isSelf ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className="font-mono text-xs text-foreground">{influence.toFixed(3)}</span>
        {bias !== 0 && (
          <span className="font-sans text-[10px] text-muted-foreground/70">{biasLabel}</span>
        )}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NodeInspectorCard() {
  const { t } = useTranslation();

  const selectedAgentIndex = useSimulationStore((s) => s.selectedAgentIndex);
  const topology = useSimulationStore((s) => s.topology);
  const setSelectedAgentIndex = useSimulationStore((s) => s.setSelectedAgentIndex);

  if (selectedAgentIndex === null || topology === null) return null;

  const agent = topology.agents.find((a) => a.index === selectedAgentIndex);
  if (!agent) return null;

  const agentNameMap = new Map(topology.agents.map((a) => [a.index, a.name ?? String(a.index)]));

  const strategyLabel: Record<number, string> = {
    0: t("enums.silenceStrategy.degroot"),
    1: t("enums.silenceStrategy.majority"),
    2: t("enums.silenceStrategy.threshold"),
    3: t("enums.silenceStrategy.confidence"),
  };

  const effectLabel: Record<number, string> = {
    0: t("enums.silenceEffect.degroot"),
    1: t("enums.silenceEffect.memory"),
    2: t("enums.silenceEffect.memoryless"),
  };

  const biasLabel: Record<number, string> = {
    0: t("simulationConfig.biasNone"),
    1: t("simulationConfig.biasConfirmation"),
    2: t("simulationConfig.biasBackfire"),
    3: t("simulationConfig.biasAuthority"),
    4: t("simulationConfig.biasInsular"),
  };

  // Outgoing: edges where this agent is the source (includes self-loop)
  const outgoing = topology.edges.filter((e) => e.source === agent.index);
  // Incoming: edges where this agent is the target, excluding self-loop (already in outgoing)
  const incoming = topology.edges.filter(
    (e) => e.target === agent.index && e.source !== agent.index,
  );

  return (
    <Card className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs font-semibold text-foreground">
          {t("liveRun.sidebar.nodeInspector.title")}
        </span>
        <button
          type="button"
          aria-label="Deselect node"
          onClick={() => setSelectedAgentIndex(null)}
          className={cn(
            "flex size-4 items-center justify-center rounded text-muted-foreground",
            "transition-colors hover:text-foreground",
          )}
        >
          <X className="size-3" />
        </button>
      </div>

      <p className="font-sans text-xs font-medium text-foreground">
        {agent.name ??
          t("liveRun.sidebar.nodeInspector.agent", { index: String(agent.index) })}
      </p>

      <Separator />

      {/* Agent properties */}
      <div className="flex flex-col gap-2">
        <InfoRow
          label={t("liveRun.sidebar.nodeInspector.initialBelief")}
          value={agent.initialBelief.toFixed(3)}
        />
        <InfoRow
          label={t("liveRun.sidebar.nodeInspector.toleranceRadius")}
          value={agent.toleranceRadius.toFixed(3)}
        />
        <InfoRow
          label={t("liveRun.sidebar.nodeInspector.toleranceOffset")}
          value={agent.toleranceOffset.toFixed(3)}
        />
        <InfoRow
          label={t("liveRun.sidebar.nodeInspector.silenceStrategy")}
          value={strategyLabel[agent.silenceStrategy] ?? String(agent.silenceStrategy)}
        />
        <InfoRow
          label={t("liveRun.sidebar.nodeInspector.silenceEffect")}
          value={effectLabel[agent.silenceEffect] ?? String(agent.silenceEffect)}
        />
      </div>

      {/* Outgoing edges */}
      {outgoing.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <SectionTitle>
              {t("liveRun.sidebar.nodeInspector.outgoing", { count: String(outgoing.length) })}
            </SectionTitle>
            {outgoing.map((e) => {
              const isSelf = e.target === agent.index;
              const neighborLabel = isSelf
                ? `↺ ${agentNameMap.get(e.target) ?? String(e.target)}`
                : `→ ${agentNameMap.get(e.target) ?? String(e.target)}`;
              return (
                <EdgeRow
                  key={`out-${e.target}`}
                  label={neighborLabel}
                  influence={e.influence}
                  bias={e.bias}
                  biasLabel={biasLabel[e.bias] ?? String(e.bias)}
                  isSelf={isSelf}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Incoming edges */}
      {incoming.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <SectionTitle>
              {t("liveRun.sidebar.nodeInspector.incoming", { count: String(incoming.length) })}
            </SectionTitle>
            {incoming.map((e) => (
              <EdgeRow
                key={`in-${e.source}`}
                label={`← ${agentNameMap.get(e.source) ?? String(e.source)}`}
                influence={e.influence}
                bias={e.bias}
                biasLabel={biasLabel[e.bias] ?? String(e.bias)}
              />
            ))}
          </div>
        </>
      )}

      {outgoing.length === 0 && incoming.length === 0 && (
        <>
          <Separator />
          <p className="font-sans text-xs text-muted-foreground">
            {t("liveRun.sidebar.nodeInspector.noConnections")}
          </p>
        </>
      )}
    </Card>
  );
}
