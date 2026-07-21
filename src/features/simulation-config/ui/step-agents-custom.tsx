import { Info, X } from "lucide-react";
import { useRef } from "react";
import type {
  AgentSpec,
  CognitiveBias,
  EdgeSpec,
  SilenceEffect,
  SilenceStrategy,
} from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import type {
  CustomSimFormValues,
  SimConfigValidationErrors,
  SimFormValues,
} from "../types/simulation-config.types";

// ─── Label maps ───────────────────────────────────────────────────────────────

const SILENCE_STRATEGIES: { value: SilenceStrategy; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.strategyDegroot" },
  { value: 1, labelKey: "simulationConfig.strategyMajority" },
  { value: 2, labelKey: "simulationConfig.strategyThreshold" },
];

const SILENCE_EFFECTS: { value: SilenceEffect; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.effectDegroot" },
  { value: 1, labelKey: "simulationConfig.effectMemory" },
];

const COGNITIVE_BIASES: { value: CognitiveBias; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.biasNone" },
  { value: 1, labelKey: "simulationConfig.biasConfirmation" },
  { value: 2, labelKey: "simulationConfig.biasBackfire" },
  { value: 3, labelKey: "simulationConfig.biasAuthority" },
];

// ─── Stable-key helpers ───────────────────────────────────────────────────────
// AgentSpec / EdgeSpec are backend types without an id field.
// We track stable UUIDs in refs so React can reconcile rows correctly
// without mutating the form state shape.

function syncKeys(ref: React.MutableRefObject<string[]>, length: number): string[] {
  while (ref.current.length < length) ref.current.push(crypto.randomUUID());
  if (ref.current.length > length) ref.current.length = length;
  return ref.current;
}

// ─── Component ────────────────────────────────────────────────────────────────

function FieldLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 cursor-help text-muted-foreground/60" />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface StepAgentsCustomProps {
  values: SimFormValues;
  errors: SimConfigValidationErrors;
  onUpdate: (patch: Partial<SimFormValues>) => void;
}

export function StepAgentsCustom({ values, errors, onUpdate }: StepAgentsCustomProps) {
  const { t } = useTranslation();
  const { agents, edges } = values as CustomSimFormValues;

  const agentKeys = useRef<string[]>([]);
  const edgeKeys = useRef<string[]>([]);
  syncKeys(agentKeys, agents.length);
  syncKeys(edgeKeys, edges.length);

  // ── Agent helpers ────────────────────────────────────────────────────────────

  const updateAgent = (index: number, patch: Partial<AgentSpec>) => {
    const updated = agents.map((a, i) => (i === index ? { ...a, ...patch } : a));

    // Propagate name change to all edges atomically
    if (patch.name !== undefined) {
      const prevName = agents[index]?.name;
      if (prevName !== undefined && prevName !== patch.name) {
        const updatedEdges = edges.map((e) => ({
          ...e,
          source: e.source === prevName ? patch.name! : e.source,
          target: e.target === prevName ? patch.name! : e.target,
        }));
        onUpdate({ agents: updated, edges: updatedEdges } as Partial<SimFormValues>);
        return;
      }
    }

    onUpdate({ agents: updated } as Partial<SimFormValues>);
  };

  const addAgent = () => {
    agentKeys.current.push(crypto.randomUUID());
    const newAgent: AgentSpec = {
      name: "",
      belief: 0.5,
      toleranceRadius: 0.2,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    };
    onUpdate({ agents: [...agents, newAgent] } as Partial<SimFormValues>);
  };

  const removeAgent = (index: number) => {
    agentKeys.current.splice(index, 1);
    const removedName = agents[index]?.name;
    const updatedAgents = agents.filter((_, i) => i !== index);

    if (removedName) {
      // Remove orphaned edges in reverse index order to keep edgeKeys in sync
      const orphanIndices = edges.reduce<number[]>(
        (acc, e, j) => (e.source === removedName || e.target === removedName ? [...acc, j] : acc),
        [],
      );
      [...orphanIndices].reverse().forEach((j) => edgeKeys.current.splice(j, 1));
      const updatedEdges = edges.filter(
        (e) => e.source !== removedName && e.target !== removedName,
      );
      onUpdate({ agents: updatedAgents, edges: updatedEdges } as Partial<SimFormValues>);
    } else {
      onUpdate({ agents: updatedAgents } as Partial<SimFormValues>);
    }
  };

  // ── Edge helpers ─────────────────────────────────────────────────────────────

  const updateEdge = (index: number, patch: Partial<EdgeSpec>) => {
    const updated = edges.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onUpdate({ edges: updated } as Partial<SimFormValues>);
  };

  const addEdge = () => {
    edgeKeys.current.push(crypto.randomUUID());
    const newEdge: EdgeSpec = {
      source: "",
      target: "",
      influence: 1,
      bias: 0,
    };
    onUpdate({ edges: [...edges, newEdge] } as Partial<SimFormValues>);
  };

  const removeEdge = (index: number) => {
    edgeKeys.current.splice(index, 1);
    onUpdate({ edges: edges.filter((_, i) => i !== index) } as Partial<SimFormValues>);
  };

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* ── Agents section ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("simulationConfig.customAgentsTableTitle")}</h3>

          {agents.length === 0 && (
            <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
              {t("simulationConfig.customAgentsEmpty")}
            </p>
          )}

          <div className="space-y-2">
            {agents.map((agent, i) => (
              <Card key={agentKeys.current[i]} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAgent(i)}
                  aria-label={t("simulationConfig.customRemoveAgent")}
                >
                  <X className="h-4 w-4" />
                </Button>

                <CardContent className="space-y-3 pr-10">
                  {/* Name */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t("simulationConfig.customAgentName")}
                    </p>
                    <Input
                      type="text"
                      placeholder={t("simulationConfig.customAgentNamePlaceholder")}
                      value={agent.name}
                      onChange={(e) => updateAgent(i, { name: e.target.value })}
                    />
                  </div>

                  {/* Strategy / Effect row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <FieldLabel
                        label={t("simulationConfig.customAgentStrategy")}
                        tooltip={t("simulationConfig.tooltipAgentStrategy")}
                      />
                      <Select
                        value={String(agent.silenceStrategy)}
                        onValueChange={(v) =>
                          updateAgent(i, { silenceStrategy: Number(v) as SilenceStrategy })
                        }
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SILENCE_STRATEGIES.map((s) => (
                            <SelectItem key={s.value} value={String(s.value)}>
                              {t(s.labelKey as Parameters<typeof t>[0])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <FieldLabel
                        label={t("simulationConfig.customAgentEffect")}
                        tooltip={t("simulationConfig.tooltipAgentEffect")}
                      />
                      <Select
                        value={String(agent.silenceEffect)}
                        onValueChange={(v) =>
                          updateAgent(i, { silenceEffect: Number(v) as SilenceEffect })
                        }
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SILENCE_EFFECTS.map((e) => (
                            <SelectItem key={e.value} value={String(e.value)}>
                              {t(e.labelKey as Parameters<typeof t>[0])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Belief / tolerance row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <FieldLabel
                        label={t("simulationConfig.customAgentBelief")}
                        tooltip={t("simulationConfig.tooltipAgentBelief")}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={agent.belief}
                        onChange={(e) => updateAgent(i, { belief: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel
                        label={t("simulationConfig.customAgentToleranceRadius")}
                        tooltip={t("simulationConfig.tooltipAgentToleranceRadius")}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={agent.toleranceRadius}
                        onChange={(e) =>
                          updateAgent(i, { toleranceRadius: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel
                        label={t("simulationConfig.customAgentToleranceOffset")}
                        tooltip={t("simulationConfig.tooltipAgentToleranceOffset")}
                      />
                      <Input
                        type="number"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={agent.toleranceOffset}
                        onChange={(e) =>
                          updateAgent(i, { toleranceOffset: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="button" variant="link" size="sm" className="px-0" onClick={addAgent}>
            + {t("simulationConfig.customAddAgent")}
          </Button>
          {errors.customNoAgents && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorCustomNoAgents")}</p>
          )}
        </div>

        <Separator />

        {/* ── Edges section ───────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("simulationConfig.customEdgesTableTitle")}</h3>

          {edges.length === 0 && (
            <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
              {t("simulationConfig.customEdgesEmpty")}
            </p>
          )}

          <div className="space-y-2">
            {edges.map((edge, i) => {
              const namedAgents = agents.filter((a) => a.name.trim() !== "");
              // Pairs already committed by every OTHER edge: "source→target"
              const usedPairs = new Set(
                edges.filter((_, j) => j !== i).map((e) => `${e.source}→${e.target}`),
              );
              // An agent is a valid source if it still has at least one free target slot
              const validSources = namedAgents.filter(
                (a) =>
                  a.name === edge.source ||
                  namedAgents.some((b) => !usedPairs.has(`${a.name}→${b.name}`)),
              );
              // Valid targets depend on a chosen source
              const validTargets = edge.source
                ? namedAgents.filter(
                    (a) => a.name === edge.target || !usedPairs.has(`${edge.source}→${a.name}`),
                  )
                : namedAgents.filter((a) => a.name === edge.target);

              return (
                <Card key={edgeKeys.current[i]} className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                    onClick={() => removeEdge(i)}
                    aria-label={t("simulationConfig.customRemoveEdge")}
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  <CardContent className="space-y-3 pr-10">
                    {/* Source / Target */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t("simulationConfig.customEdgeSource")}
                        </p>
                        <Select
                          value={edge.source}
                          onValueChange={(v) => updateEdge(i, { source: v })}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue
                              placeholder={t("simulationConfig.customEdgeSourcePlaceholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {validSources.map((a) => (
                              <SelectItem key={a.name} value={a.name}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t("simulationConfig.customEdgeTarget")}
                        </p>
                        <Select
                          value={edge.target}
                          onValueChange={(v) => updateEdge(i, { target: v })}
                          disabled={!edge.source}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue
                              placeholder={t("simulationConfig.customEdgeTargetPlaceholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {validTargets.map((a) => (
                              <SelectItem key={a.name} value={a.name}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Influence / Bias */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t("simulationConfig.customEdgeInfluence")}
                        </p>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={edge.influence}
                          onChange={(e) => updateEdge(i, { influence: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t("simulationConfig.customEdgeBias")}
                        </p>
                        <Select
                          value={String(edge.bias)}
                          onValueChange={(v) => updateEdge(i, { bias: Number(v) as CognitiveBias })}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COGNITIVE_BIASES.map((b) => (
                              <SelectItem key={b.value} value={String(b.value)}>
                                {t(b.labelKey as Parameters<typeof t>[0])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={addEdge}
            disabled={edges.length >= agents.filter((a) => a.name.trim() !== "").length ** 2}
          >
            + {t("simulationConfig.customAddEdge")}
          </Button>
          {errors.customNoEdges && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorCustomNoEdges")}</p>
          )}
          {errors.customEdgeDuplicate && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorCustomEdgeDuplicate")}
            </p>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
