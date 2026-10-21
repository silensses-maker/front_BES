import { useRef } from "react";
import { useTranslation } from "@/shared/i18n";
import {
  cognitiveBiasLabel,
  silenceEffectLabel,
  silenceStrategyLabel,
} from "@/shared/i18n/enum-labels";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { fixedStrategyHintKey } from "../lib/fixed-strategy-hint";
import { formatNumber, listValidationMessages } from "../lib/live-summary";
import { computeMaxEdges, MAX_SEED } from "../lib/validation";
import type { RelaunchInfo } from "../model/simulation-config.store";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  SimConfigValidationErrors,
  SimFormValues,
} from "../types/simulation-config.types";

interface StepReviewProps {
  values: SimFormValues;
  errors: SimConfigValidationErrors;
  usageLimitError: { limit: number; requested: number } | null;
  maxAgents?: number | null;
  maxIterations?: number | null;
  maxNetworks?: number | null;
  /** True when the draft was imported from a file — Review shows "Cargada desde archivo". */
  loadedFromFile?: boolean;
  /** Set when the draft was pre-filled from a past run (#127): Review explains what is replayed. */
  relaunchedFrom?: RelaunchInfo | null;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function StepReview({
  values,
  errors,
  usageLimitError,
  maxAgents = null,
  maxIterations = null,
  maxNetworks = null,
  loadedFromFile = false,
  relaunchedFrom = null,
  onExport,
  onImport,
}: StepReviewProps) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasErrors = Object.values(errors).some(Boolean);
  const isGenerated = values.networkType === "generated";
  const gen = isGenerated ? (values as GeneratedSimFormValues) : null;
  const custom = isGenerated ? null : (values as CustomSimFormValues);
  const maxEdges = gen ? computeMaxEdges(gen.density, gen.numberOfAgents) : 0;
  const fmt = (n: number) => formatNumber(n, i18n.language);

  const validationMessages = listValidationMessages(errors, {
    // Custom networks: the agent quota counts the defined agents (#122).
    requested: gen
      ? fmt(gen.agentTypes.reduce((sum, r) => sum + r.count, 0))
      : fmt(custom?.agents.length ?? 0),
    limit: maxAgents !== null ? fmt(maxAgents) : "∞",
    iterationLimit: maxIterations !== null ? fmt(maxIterations) : "∞",
    networks: gen ? fmt(gen.numberOfNetworks) : "",
    networkLimit: maxNetworks !== null ? fmt(maxNetworks) : "∞",
    density: gen ? fmt(gen.density) : "",
    agents: gen ? fmt(gen.numberOfAgents) : "",
    actual: gen ? fmt(gen.agentTypes.reduce((sum, r) => sum + r.count, 0)) : "",
    expected: gen ? fmt(gen.numberOfAgents) : "",
    bias: gen ? fmt(gen.biasTypes.reduce((sum, r) => sum + r.count, 0)) : "",
    maxEdges: fmt(maxEdges),
    maxSeed: fmt(MAX_SEED),
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("simulationConfig.reviewTitle")}</h3>

      {/* Re-launch from the history (#127): what will and will not be replayed */}
      {relaunchedFrom !== null && (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <p className="break-all">
            {relaunchedFrom.seedKept
              ? t("simulationConfig.relaunchNote", {
                  id: relaunchedFrom.runId,
                  seed: relaunchedFrom.seed,
                })
              : t("simulationConfig.relaunchNoteSeedDropped", {
                  id: relaunchedFrom.runId,
                  seed: relaunchedFrom.seed,
                  max: fmt(MAX_SEED),
                })}
          </p>
          {!relaunchedFrom.densityExact && (
            <p className="text-muted-foreground">
              {t("simulationConfig.relaunchDensityEstimated", {
                effective: fmt(relaunchedFrom.effectiveDensity),
              })}
            </p>
          )}
          {relaunchedFrom.effectiveNow !== relaunchedFrom.effectiveDensity && (
            <p className="text-warn">
              {t("simulationConfig.relaunchDensityChanged", {
                now: fmt(relaunchedFrom.effectiveNow),
                effective: fmt(relaunchedFrom.effectiveDensity),
              })}
            </p>
          )}
        </div>
      )}

      {/* Network summary */}
      <Card className="gap-0 py-0">
        <CardContent className="divide-y divide-border px-0 py-0 text-sm">
          <div className="flex justify-between px-4 py-2">
            <span className="text-muted-foreground">{t("simulationConfig.networkType")}</span>
            <span className="font-medium">
              {loadedFromFile
                ? t("simulationConfig.networkTypeLoaded")
                : values.networkType === "generated"
                  ? t("simulationConfig.networkTypeGenerated")
                  : t("simulationConfig.networkTypeCustom")}
            </span>
          </div>

          {custom !== null && (
            <>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.customNetworkName")}
                </span>
                <span className="font-medium">{custom.networkName}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.iterationLimit")}
                </span>
                <span>{fmt(custom.iterationLimit)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.stopThreshold")}</span>
                <span>{custom.stopThreshold}</span>
              </div>
            </>
          )}

          {gen !== null && (
            <>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.numberOfAgents")}
                </span>
                <span>{fmt(gen.numberOfAgents)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.numberOfNetworks")}
                </span>
                <span>{gen.numberOfNetworks}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.density")}</span>
                <span>{gen.density}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.iterationLimit")}
                </span>
                <span>{fmt(gen.iterationLimit)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.stopThreshold")}</span>
                <span>{gen.stopThreshold}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.seed")}</span>
                <span>{gen.seed === null ? t("simulationConfig.seedRandom") : gen.seed}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Replaces the save-mode row (#133): every run is saved in DEBUG mode in this phase, so
          the review states what is actually stored. Shown for every flow (generated, custom and
          loaded from a file — the load flow skips the network step). */}
      <p className="text-xs text-muted-foreground">{t("simulationConfig.storageNote")}</p>

      {/* Agent distribution */}
      {gen !== null && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("simulationConfig.reviewAgentDistribution")}
          </p>
          <Card className="gap-0 py-0">
            <CardContent className="px-0 py-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-normal">
                      {t("simulationConfig.silenceStrategy")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-normal">
                      {t("simulationConfig.silenceEffect")}
                    </th>
                    <th className="px-4 py-1.5 text-right font-normal">
                      {t("simulationConfig.reviewColCount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gen.agentTypes.map((row) => {
                    const strategyLabel = silenceStrategyLabel(t, row.silenceStrategy);
                    const effectLabel = silenceEffectLabel(t, row.silenceEffect);
                    // Fixed by the simulator (#120) — shown read-only, never user input.
                    const fixedHintKey = fixedStrategyHintKey(row.silenceStrategy);

                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-1.5">
                          {strategyLabel}
                          {fixedHintKey !== null && (
                            <span className="block text-xs text-muted-foreground">
                              {t(fixedHintKey)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{effectLabel}</td>
                        <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                          {fmt(row.count)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bias distribution */}
      {gen !== null && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("simulationConfig.reviewBiasDistributionWithEdges", { edges: fmt(maxEdges) })}
          </p>
          <Card className="gap-0 py-0">
            <CardContent className="px-0 py-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-normal">
                      {t("simulationConfig.cognitiveBias")}
                    </th>
                    <th className="px-4 py-1.5 text-right font-normal">
                      {t("simulationConfig.reviewColCount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gen.biasTypes.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-1.5">{cognitiveBiasLabel(t, row.cognitiveBias)}</td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                        {fmt(row.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom agents table */}
      {custom !== null && custom.agents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("simulationConfig.customAgentsTableTitle")}
            <span className="ml-1 text-muted-foreground/60">({custom.agents.length})</span>
          </p>
          <Card className="gap-0 py-0">
            <CardContent className="max-h-48 overflow-y-auto px-0 py-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-normal">
                      {t("simulationConfig.customAgentName")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-normal">
                      {t("simulationConfig.customAgentStrategy")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-normal">
                      {t("simulationConfig.customAgentEffect")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {custom.agents.map((agent) => (
                    <tr key={agent.name}>
                      <td className="px-4 py-1.5 font-medium">{agent.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {silenceStrategyLabel(t, agent.silenceStrategy)}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {silenceEffectLabel(t, agent.silenceEffect)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom edges table */}
      {custom !== null && custom.edges.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("simulationConfig.customEdgesTableTitle")}
            <span className="ml-1 text-muted-foreground/60">({custom.edges.length})</span>
          </p>
          <Card className="gap-0 py-0">
            <CardContent className="max-h-48 overflow-y-auto px-0 py-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-normal">
                      {t("simulationConfig.customEdgeSource")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-normal">
                      {t("simulationConfig.customEdgeTarget")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      {t("simulationConfig.customEdgeInfluence")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-normal">
                      {t("simulationConfig.customEdgeBias")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {custom.edges.map((edge) => (
                    <tr key={`${edge.source}→${edge.target}`}>
                      <td className="px-4 py-1.5 font-medium">{edge.source}</td>
                      <td className="px-2 py-1.5">{edge.target}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{edge.influence}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {cognitiveBiasLabel(t, edge.bias)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export / Import */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={onExport}>
          {t("simulationConfig.exportJson")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          {t("simulationConfig.importJson")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Validation errors (single source: listValidationMessages) */}
      {hasErrors ? (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-semibold text-destructive">
            {t("simulationConfig.reviewErrorsTitle")}
          </p>
          {validationMessages.map(({ key, params }) => (
            <p key={key} className="text-xs text-destructive">
              • {t(key as Parameters<typeof t>[0], params)}
            </p>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-ok/30 bg-ok/10 px-4 py-2.5">
          <p className="text-sm font-medium text-ok">{t("simulationConfig.reviewValid")}</p>
        </div>
      )}

      {/* Usage limit error from backend */}
      {usageLimitError !== null && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            {t("simulationConfig.errorLimitExceededDetail", {
              limit: String(usageLimitError.limit),
              requested: String(usageLimitError.requested),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
