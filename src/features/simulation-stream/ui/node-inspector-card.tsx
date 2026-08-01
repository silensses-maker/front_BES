import { X } from "lucide-react";
import { useSimulationStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { interpolateOpinion } from "@/shared/lib/opinion-palette";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

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

/** Mockup: belief label + mono value above a 5px bar tinted by the value. */
function BeliefMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value.toFixed(3)}</span>
      </div>
      <div className="h-1.25 overflow-hidden rounded-[3px] bg-accent">
        <div
          className="h-full"
          style={{ width: `${value * 100}%`, background: interpolateOpinion(value) }}
        />
      </div>
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

/** Top-5 cap for the influence lists (mockup) — headers show the full count. */
const MAX_EDGE_ROWS = 5;

// ─── Component ────────────────────────────────────────────────────────────────

export function NodeInspectorCard() {
  const { t } = useTranslation();

  const selectedAgentIndex = useSimulationStore((s) => s.selectedAgentIndex);
  const topology = useSimulationStore((s) => s.topology);
  const latestFrame = useSimulationStore((s) => s.latestFrame);
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

  // Viewed-round state (guarded against a stale frame from another network)
  const frame =
    latestFrame !== null && latestFrame.networkId === topology.networkId ? latestFrame : null;
  const publicBelief = frame?.publicBelief[agent.index] ?? agent.initialBelief;
  const privateBelief = frame?.privateBelief[agent.index] ?? agent.initialBelief;
  const speakingByte = frame?.speaking[agent.index];
  const speaking = speakingByte === undefined ? null : speakingByte !== 0;
  const divergence = Math.abs(publicBelief - privateBelief);

  // Outgoing: edges where this agent is the source (includes self-loop)
  const outgoing = topology.edges.filter((e) => e.source === agent.index);
  // Incoming: edges where this agent is the target, excluding self-loop (already in outgoing)
  const incoming = topology.edges.filter(
    (e) => e.target === agent.index && e.source !== agent.index,
  );

  return (
    <Card className="flex flex-col gap-3 border-primary p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs font-semibold text-foreground">
          {agent.name ?? t("liveRun.sidebar.nodeInspector.agent", { index: String(agent.index) })}
        </span>
        <button
          type="button"
          aria-label={t("runView.inspectorDeselectAria")}
          onClick={() => setSelectedAgentIndex(null)}
          className={cn(
            "flex size-4 items-center justify-center rounded text-muted-foreground",
            "transition-colors hover:text-foreground",
          )}
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Badges: estrategia / efecto / estado (mockup pills) */}
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-accent px-2 py-0.5 font-sans text-[10.5px] font-medium text-primary">
          {strategyLabel[agent.silenceStrategy] ?? String(agent.silenceStrategy)}
        </span>
        <span className="rounded-full bg-accent px-2 py-0.5 font-sans text-[10.5px] font-medium text-primary">
          {effectLabel[agent.silenceEffect] ?? String(agent.silenceEffect)}
        </span>
        {speaking !== null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium",
              speaking ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn",
            )}
          >
            {speaking ? t("runView.speaking") : t("runView.silent")}
          </span>
        )}
      </div>

      {/* Viewed-round beliefs (mockup meters) */}
      <div className="flex flex-col gap-2">
        <BeliefMeter label={t("runView.inspectorPublic")} value={publicBelief} />
        <BeliefMeter label={t("runView.inspectorPrivate")} value={privateBelief} />
        <div className="flex justify-between border-t border-border pt-1.5 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-muted-foreground">
                {t("runView.inspectorDivergence")}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-60">
              {t("runView.inspectorDivergenceTip")}
            </TooltipContent>
          </Tooltip>
          <span className="font-mono">{divergence.toFixed(3)}</span>
        </div>
      </div>

      <Separator />

      {/* Static agent properties (superset over the mockup) */}
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
      </div>

      {/* Outgoing edges — top 5, full count in the header (mockup) */}
      {outgoing.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <SectionTitle>
              {t("runView.inspectorInfluences", { count: String(outgoing.length) })}
            </SectionTitle>
            {outgoing.slice(0, MAX_EDGE_ROWS).map((e) => {
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

      {/* Incoming edges — top 5, full count in the header (mockup) */}
      {incoming.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <SectionTitle>
              {t("runView.inspectorInfluencedBy", { count: String(incoming.length) })}
            </SectionTitle>
            {incoming.slice(0, MAX_EDGE_ROWS).map((e) => (
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
