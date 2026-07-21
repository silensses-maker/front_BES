import { useRef } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { computeMaxEdges } from "../lib/validation";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  SimConfigValidationErrors,
  SimFormValues,
} from "../types/simulation-config.types";

const STRATEGY_KEYS: Record<0 | 1 | 2 | 3, string> = {
  0: "simulationConfig.strategyDegroot",
  1: "simulationConfig.strategyMajority",
  2: "simulationConfig.strategyThreshold",
  3: "simulationConfig.strategyConfidence",
};

const EFFECT_KEYS: Record<0 | 1 | 2, string> = {
  0: "simulationConfig.effectDegroot",
  1: "simulationConfig.effectMemory",
  2: "simulationConfig.effectMemoryless",
};

const BIAS_KEYS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "simulationConfig.biasNone",
  1: "simulationConfig.biasConfirmation",
  2: "simulationConfig.biasBackfire",
  3: "simulationConfig.biasAuthority",
  4: "simulationConfig.biasInsular",
};

interface StepReviewProps {
  values: SimFormValues;
  errors: SimConfigValidationErrors;
  usageLimitError: { limit: number; requested: number } | null;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function StepReview({
  values,
  errors,
  usageLimitError,
  onExport,
  onImport,
}: StepReviewProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasErrors = Object.values(errors).some(Boolean);
  const isGenerated = values.networkType === "generated";
  const gen = isGenerated ? (values as GeneratedSimFormValues) : null;
  const custom = isGenerated ? null : (values as CustomSimFormValues);
  const maxEdges = gen ? computeMaxEdges(gen.density, gen.numberOfAgents) : 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("simulationConfig.reviewTitle")}</h3>

      {/* Network summary */}
      <Card className="gap-0 py-0">
        <CardContent className="divide-y divide-border px-0 py-0 text-sm">
          <div className="flex justify-between px-4 py-2">
            <span className="text-muted-foreground">{t("simulationConfig.networkType")}</span>
            <span className="font-medium">
              {values.networkType === "generated"
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
                <span>{custom.iterationLimit}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.stopThreshold")}</span>
                <span>{custom.stopThreshold}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.saveMode")}</span>
                <span>
                  {custom.saveMode === 0
                    ? t("simulationConfig.saveModeFull")
                    : custom.saveMode === 1
                      ? t("simulationConfig.saveModeStandard")
                      : t("simulationConfig.saveModeDebug")}
                </span>
              </div>
            </>
          )}

          {gen !== null && (
            <>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">
                  {t("simulationConfig.numberOfAgents")}
                </span>
                <span>{gen.numberOfAgents}</span>
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
                <span>{gen.iterationLimit}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.stopThreshold")}</span>
                <span>{gen.stopThreshold}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.seed")}</span>
                <span>{gen.seed === null ? t("simulationConfig.seedRandom") : gen.seed}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">{t("simulationConfig.saveMode")}</span>
                <span>
                  {gen.saveMode === 0
                    ? t("simulationConfig.saveModeFull")
                    : gen.saveMode === 1
                      ? t("simulationConfig.saveModeStandard")
                      : t("simulationConfig.saveModeDebug")}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                    const strategyLabel = t(
                      STRATEGY_KEYS[row.silenceStrategy] as Parameters<typeof t>[0],
                    );
                    const effectLabel = t(
                      EFFECT_KEYS[row.silenceEffect] as Parameters<typeof t>[0],
                    );
                    const extra =
                      (row.silenceStrategy === 1 || row.silenceStrategy === 2) &&
                      row.majorityThreshold !== undefined
                        ? ` · ${t("simulationConfig.reviewThreshold", { value: String(row.majorityThreshold) })}`
                        : row.silenceStrategy === 3 && row.confidence !== undefined
                          ? ` · ${t("simulationConfig.reviewConfidence", { value: String(row.confidence) })}`
                          : "";

                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-1.5">
                          {strategyLabel}
                          {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{effectLabel}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{row.count}</td>
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
            {t("simulationConfig.reviewBiasDistribution")}
            <span className="ml-1 text-muted-foreground/60">({maxEdges} edges)</span>
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
                      <td className="px-4 py-1.5">
                        {t(BIAS_KEYS[row.cognitiveBias] as Parameters<typeof t>[0])}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{row.count}</td>
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
                        {t(
                          STRATEGY_KEYS[agent.silenceStrategy as 0 | 1 | 2 | 3] as Parameters<
                            typeof t
                          >[0],
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {t(
                          EFFECT_KEYS[agent.silenceEffect as 0 | 1 | 2] as Parameters<typeof t>[0],
                        )}
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
                        {t(BIAS_KEYS[edge.bias as 0 | 1 | 2 | 3 | 4] as Parameters<typeof t>[0])}
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

      {/* Validation errors */}
      {hasErrors && (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
          {errors.stopThresholdOutOfRange && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorStopThreshold")}</p>
          )}
          {errors.iterationLimitExceeded && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorIterationLimit")}</p>
          )}
          {errors.agentLimitExceeded && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorAgentLimit")}</p>
          )}
          {errors.agentCountMismatch && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorAgentCountMismatch", {
                expected: String((values as GeneratedSimFormValues).numberOfAgents),
                actual: String(
                  (values as GeneratedSimFormValues).agentTypes?.reduce((s, r) => s + r.count, 0) ??
                    0,
                ),
              })}
            </p>
          )}
          {errors.biasCountMismatch && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorBiasMismatch")}</p>
          )}
          {errors.countsInvalid && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorCountsInvalid")}</p>
          )}
          {errors.customNetworkNameEmpty && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorCustomNetworkNameEmpty")}
            </p>
          )}
          {errors.customNoAgents && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorCustomNoAgents")}</p>
          )}
          {errors.customNoEdges && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorCustomNoEdges")}</p>
          )}
          {errors.customAgentInvalid && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorCustomAgentInvalid")}
            </p>
          )}
          {errors.customEdgeInvalid && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorCustomEdgeInvalid")}
            </p>
          )}
          {errors.customEdgeUnknownAgent && (
            <p className="text-sm text-destructive">
              {t("simulationConfig.errorCustomEdgeUnknownAgent")}
            </p>
          )}
          {errors.importInvalid && (
            <p className="text-sm text-destructive">{t("simulationConfig.errorImportInvalid")}</p>
          )}
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
