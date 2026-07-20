import { X } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Slider } from "@/shared/ui/slider";
import { computeMaxEdges } from "../lib/validation";
import type {
  AgentTypeRow,
  BiasRow,
  GeneratedSimFormValues,
  SimFormValues,
} from "../types/simulation-config.types";

const SILENCE_STRATEGIES: { value: 0 | 1 | 2 | 3; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.strategyDegroot" },
  { value: 1, labelKey: "simulationConfig.strategyMajority" },
  { value: 2, labelKey: "simulationConfig.strategyThreshold" },
  { value: 3, labelKey: "simulationConfig.strategyConfidence" },
];

const SILENCE_EFFECTS: { value: 0 | 1 | 2; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.effectDegroot" },
  { value: 1, labelKey: "simulationConfig.effectMemory" },
  { value: 2, labelKey: "simulationConfig.effectMemoryless" },
];

const COGNITIVE_BIASES: { value: 0 | 1 | 2 | 3 | 4; labelKey: string }[] = [
  { value: 0, labelKey: "simulationConfig.biasNone" },
  { value: 1, labelKey: "simulationConfig.biasConfirmation" },
  { value: 2, labelKey: "simulationConfig.biasBackfire" },
  { value: 3, labelKey: "simulationConfig.biasAuthority" },
  { value: 4, labelKey: "simulationConfig.biasInsular" },
];

interface StepAgentsProps {
  values: SimFormValues;
  maxAgents: number | null;
  onUpdate: (patch: Partial<SimFormValues>) => void;
}

export function StepAgents({ values, maxAgents, onUpdate }: StepAgentsProps) {
  const { t } = useTranslation();

  if (values.networkType !== "generated") {
    return (
      <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
        {t("simulationConfig.customAgentsNotSupported")}
      </p>
    );
  }

  const gen = values as GeneratedSimFormValues;
  const totalAgents = gen.agentTypes.reduce((s, r) => s + r.count, 0);
  const totalBias = gen.biasTypes.reduce((s, r) => s + r.count, 0);
  const maxEdges = computeMaxEdges(gen.density, gen.numberOfAgents);
  const agentCountOverLimit = maxAgents !== null && totalAgents > maxAgents;
  const agentCountMismatch = totalAgents !== gen.numberOfAgents;
  const agentsComplete = totalAgents === gen.numberOfAgents && !agentCountOverLimit;
  const biasComplete = maxEdges > 0 && totalBias === maxEdges;

  const usedCombos = gen.agentTypes.map((r) => `${r.silenceStrategy}-${r.silenceEffect}`);
  const usedBiases = gen.biasTypes.map((r) => r.cognitiveBias);

  const updateAgentRow = (index: number, patch: Partial<AgentTypeRow>) => {
    const updated = gen.agentTypes.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onUpdate({ agentTypes: updated } as Partial<SimFormValues>);
  };

  const handleAgentCountChange = (index: number, raw: number) => {
    const otherTotal = gen.agentTypes.reduce((s, r, i) => (i === index ? s : s + r.count), 0);
    const maxAllowed = gen.numberOfAgents - otherTotal;
    const clamped = Math.max(0, Math.min(raw, maxAllowed));
    updateAgentRow(index, { count: clamped });
  };

  const addAgentRow = () => {
    onUpdate({
      agentTypes: [
        ...gen.agentTypes,
        { id: crypto.randomUUID(), count: 1, silenceStrategy: 0, silenceEffect: 0 },
      ],
    } as Partial<SimFormValues>);
  };

  const removeAgentRow = (index: number) => {
    if (gen.agentTypes.length <= 1) return;
    onUpdate({
      agentTypes: gen.agentTypes.filter((_, i) => i !== index),
    } as Partial<SimFormValues>);
  };

  const updateBiasRow = (index: number, patch: Partial<BiasRow>) => {
    const updated = gen.biasTypes.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onUpdate({ biasTypes: updated } as Partial<SimFormValues>);
  };

  const handleBiasCountChange = (index: number, raw: number) => {
    const otherTotal = gen.biasTypes.reduce((s, r, i) => (i === index ? s : s + r.count), 0);
    const maxAllowed = maxEdges - otherTotal;
    const clamped = Math.max(0, Math.min(raw, maxAllowed));
    updateBiasRow(index, { count: clamped });
  };

  const addBiasRow = () => {
    onUpdate({
      biasTypes: [...gen.biasTypes, { id: crypto.randomUUID(), count: 1, cognitiveBias: 0 }],
    } as Partial<SimFormValues>);
  };

  const removeBiasRow = (index: number) => {
    if (gen.biasTypes.length <= 1) return;
    onUpdate({
      biasTypes: gen.biasTypes.filter((_, i) => i !== index),
    } as Partial<SimFormValues>);
  };

  return (
    <div className="space-y-8">
      {/* Agent types section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {t("simulationConfig.agentTypesLabel")}
            <InfoTooltip>{t("simulationConfig.agentTypesLabelHint")}</InfoTooltip>
          </h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              agentsComplete
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {t("simulationConfig.agentsAssigned", {
              assigned: String(totalAgents),
              total: String(gen.numberOfAgents),
            })}
          </span>
        </div>
        {agentCountMismatch && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.errorAgentCountMismatch", {
              expected: String(gen.numberOfAgents),
              actual: String(totalAgents),
            })}
          </p>
        )}

        <div className="space-y-2">
          {gen.agentTypes.map((row, i) => {
            const availableStrategies = SILENCE_STRATEGIES.filter((s) => {
              if (s.value === row.silenceStrategy) return true;
              return SILENCE_EFFECTS.some((e) => !usedCombos.includes(`${s.value}-${e.value}`));
            });

            const availableEffects = SILENCE_EFFECTS.filter((e) => {
              if (e.value === row.silenceEffect) return true;
              return !usedCombos.includes(`${row.silenceStrategy}-${e.value}`);
            });

            const agentPct =
              gen.numberOfAgents > 0 ? ((row.count / gen.numberOfAgents) * 100).toFixed(1) : "0.0";

            return (
              <Card key={row.id} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                  disabled={gen.agentTypes.length <= 1}
                  onClick={() => removeAgentRow(i)}
                >
                  <X className="h-4 w-4" />
                </Button>

                <CardContent className="space-y-4">
                  <div className="flex items-end gap-6">
                    <div className="flex gap-2">
                      <div className="w-36 shrink-0 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t("simulationConfig.silenceStrategy")}
                          <InfoTooltip>{t("simulationConfig.silenceStrategyHint")}</InfoTooltip>
                        </p>
                        <Select
                          value={String(row.silenceStrategy)}
                          onValueChange={(v) =>
                            updateAgentRow(i, {
                              silenceStrategy: Number(v) as 0 | 1 | 2 | 3,
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStrategies.map((s) => (
                              <SelectItem key={s.value} value={String(s.value)}>
                                {t(s.labelKey as Parameters<typeof t>[0])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-36 shrink-0 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t("simulationConfig.silenceEffect")}
                          <InfoTooltip>{t("simulationConfig.silenceEffectHint")}</InfoTooltip>
                        </p>
                        <Select
                          value={String(row.silenceEffect)}
                          onValueChange={(v) =>
                            updateAgentRow(i, { silenceEffect: Number(v) as 0 | 1 | 2 })
                          }
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableEffects.map((e) => (
                              <SelectItem key={e.value} value={String(e.value)}>
                                {t(e.labelKey as Parameters<typeof t>[0])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(row.silenceStrategy === 1 || row.silenceStrategy === 2) && (
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t("simulationConfig.majorityThreshold")}
                          <InfoTooltip>{t("simulationConfig.majorityThresholdHint")}</InfoTooltip>
                        </p>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={row.majorityThreshold ?? 0.5}
                          className="h-8 w-20"
                          onChange={(e) =>
                            updateAgentRow(i, { majorityThreshold: Number(e.target.value) })
                          }
                        />
                      </div>
                    )}

                    {row.silenceStrategy === 3 && (
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t("simulationConfig.confidence")}
                          <InfoTooltip>{t("simulationConfig.confidenceHint")}</InfoTooltip>
                        </p>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={row.confidence ?? 0.5}
                          className="h-8 w-20"
                          onChange={(e) =>
                            updateAgentRow(i, { confidence: Number(e.target.value) })
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("simulationConfig.agentCountLabel", { count: String(row.count) })}
                      </p>
                      <span className="text-xs text-muted-foreground">{agentPct}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        className="flex-1"
                        min={0}
                        max={gen.numberOfAgents}
                        step={1}
                        value={[row.count]}
                        onValueChange={(v) => handleAgentCountChange(i, v[0] ?? 0)}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={gen.numberOfAgents}
                        value={row.count}
                        className="h-7 w-20 shrink-0 text-right text-sm"
                        onChange={(e) => handleAgentCountChange(i, Number(e.target.value))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button type="button" variant="link" size="sm" className="px-0" onClick={addAgentRow}>
          + {t("simulationConfig.addAgentType")}
        </Button>
      </div>

      <Separator />
      {/* Bias types section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {t("simulationConfig.biasTypesLabel")}
            <InfoTooltip>{t("simulationConfig.biasTypesLabelHint")}</InfoTooltip>
          </h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              biasComplete
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {t("simulationConfig.biasAssigned", {
              assigned: String(totalBias),
              total: String(maxEdges),
            })}
          </span>
        </div>
        {totalBias !== maxEdges && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.biasMismatchHint", {
              maxEdges: String(maxEdges),
              bias: String(totalBias),
            })}
          </p>
        )}

        <div className="space-y-2">
          {gen.biasTypes.map((row, i) => {
            const availableBiases = COGNITIVE_BIASES.filter(
              (b) => b.value === row.cognitiveBias || !usedBiases.includes(b.value),
            );

            const biasPct = maxEdges > 0 ? ((row.count / maxEdges) * 100).toFixed(1) : "0.0";

            return (
              <Card key={row.id} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                  disabled={gen.biasTypes.length <= 1}
                  onClick={() => removeBiasRow(i)}
                >
                  <X />
                </Button>

                <CardContent className="space-y-4">
                  <div className="w-36 shrink-0 space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {t("simulationConfig.cognitiveBias")}
                      <InfoTooltip>{t("simulationConfig.cognitiveBiasHint")}</InfoTooltip>
                    </p>
                    <Select
                      value={String(row.cognitiveBias)}
                      onValueChange={(v) =>
                        updateBiasRow(i, {
                          cognitiveBias: Number(v) as 0 | 1 | 2 | 3 | 4,
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBiases.map((b) => (
                          <SelectItem key={b.value} value={String(b.value)}>
                            {t(b.labelKey as Parameters<typeof t>[0])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("simulationConfig.edgeCountLabel", { count: String(row.count) })}
                      </p>
                      <span className="text-xs text-muted-foreground">{biasPct}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        className="flex-1"
                        min={0}
                        max={maxEdges}
                        step={1}
                        value={[row.count]}
                        onValueChange={(v) => handleBiasCountChange(i, v[0] ?? 0)}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={maxEdges}
                        value={row.count}
                        className="h-7 w-20 shrink-0 text-right text-sm"
                        onChange={(e) => handleBiasCountChange(i, Number(e.target.value))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button type="button" variant="link" size="sm" className="px-0" onClick={addBiasRow}>
          + {t("simulationConfig.addBiasType")}
        </Button>
      </div>
    </div>
  );
}
