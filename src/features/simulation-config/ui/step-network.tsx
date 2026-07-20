import { useTranslation } from "@/shared/i18n";
import { Checkbox } from "@/shared/ui/checkbox";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type {
  GeneratedSimFormValues,
  SimConfigValidationErrors,
  SimFormValues,
} from "../types/simulation-config.types";

interface StepNetworkProps {
  values: SimFormValues;
  maxAgents: number | null;
  maxIterations: number | null;
  errors?: SimConfigValidationErrors;
  onUpdate: (patch: Partial<SimFormValues>) => void;
}

export function StepNetwork({
  values,
  maxAgents,
  maxIterations,
  errors,
  onUpdate,
}: StepNetworkProps) {
  const { t } = useTranslation();
  const gen = values.networkType === "generated" ? (values as GeneratedSimFormValues) : null;

  if (gen === null) {
    return (
      <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
        {t("simulationConfig.customNetworkHint")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="saveMode" className="flex items-center gap-1.5">
          {t("simulationConfig.saveMode")}
          <InfoTooltip>{t("simulationConfig.saveModeHint")}</InfoTooltip>
        </Label>
        <Select
          value={String(gen.saveMode)}
          onValueChange={(v) =>
            onUpdate({ saveMode: Number(v) as 0 | 1 | 2 } as Partial<SimFormValues>)
          }
        >
          <SelectTrigger id="saveMode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("simulationConfig.saveModeFull")}</SelectItem>
            <SelectItem value="1">{t("simulationConfig.saveModeStandard")}</SelectItem>
            <SelectItem value="2">{t("simulationConfig.saveModeDebug")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="numberOfNetworks" className="flex items-center gap-1.5">
          {t("simulationConfig.numberOfNetworks")}
          <InfoTooltip>{t("simulationConfig.numberOfNetworksHint")}</InfoTooltip>
        </Label>
        <Input
          id="numberOfNetworks"
          type="number"
          min={1}
          value={gen.numberOfNetworks}
          onChange={(e) =>
            onUpdate({ numberOfNetworks: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="numberOfAgents" className="flex items-center gap-1.5">
          {t("simulationConfig.numberOfAgents")}
          <InfoTooltip>{t("simulationConfig.numberOfAgentsHint")}</InfoTooltip>
        </Label>
        <Input
          id="numberOfAgents"
          type="number"
          min={1}
          max={maxAgents ?? undefined}
          value={gen.numberOfAgents}
          onChange={(e) =>
            onUpdate({ numberOfAgents: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="density" className="flex items-center gap-1.5">
          {t("simulationConfig.density")}
          <InfoTooltip>{t("simulationConfig.densityHint")}</InfoTooltip>
        </Label>
        <Input
          id="density"
          type="number"
          min={2}
          step={1}
          value={gen.density}
          onChange={(e) => onUpdate({ density: Number(e.target.value) } as Partial<SimFormValues>)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="iterationLimit" className="flex items-center gap-1.5">
          {t("simulationConfig.iterationLimit")}
          <InfoTooltip>{t("simulationConfig.iterationLimitHint")}</InfoTooltip>
        </Label>
        <Input
          id="iterationLimit"
          type="number"
          min={1}
          max={maxIterations ?? undefined}
          value={gen.iterationLimit}
          disabled={maxIterations !== null && gen.iterationLimit > maxIterations}
          onChange={(e) =>
            onUpdate({ iterationLimit: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
        {errors?.iterationLimitExceeded && (
          <p className="text-xs text-destructive">{t("simulationConfig.errorIterationLimit")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="stopThreshold" className="flex items-center gap-1.5">
          {t("simulationConfig.stopThreshold")}
          <InfoTooltip>{t("simulationConfig.stopThresholdHint")}</InfoTooltip>
        </Label>
        <Input
          id="stopThreshold"
          type="number"
          min={0.0001}
          max={0.9999}
          step={0.001}
          value={gen.stopThreshold}
          onChange={(e) =>
            onUpdate({ stopThreshold: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
        {errors?.stopThresholdOutOfRange && (
          <p className="text-xs text-destructive">{t("simulationConfig.errorStopThreshold")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          {t("simulationConfig.seed")}
          <InfoTooltip>{t("simulationConfig.seedHint")}</InfoTooltip>
        </Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="seed-random"
              checked={gen.seed === null}
              onCheckedChange={(checked) =>
                onUpdate({ seed: checked ? null : 42 } as Partial<SimFormValues>)
              }
            />
            <Label htmlFor="seed-random" className="cursor-pointer font-normal">
              {t("simulationConfig.seedRandom")}
            </Label>
          </div>
          {gen.seed !== null && (
            <Input
              type="number"
              className="w-32"
              value={gen.seed}
              onChange={(e) => onUpdate({ seed: Number(e.target.value) } as Partial<SimFormValues>)}
            />
          )}
        </div>
      </div>

      {/* Cross-step validation errors that would otherwise silently disable Next */}
      {(errors?.agentCountMismatch ||
        errors?.biasCountMismatch ||
        errors?.countsInvalid ||
        errors?.agentLimitExceeded) && (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          {errors.agentCountMismatch && (
            <p className="text-xs text-destructive">
              {t("simulationConfig.errorAgentCountMismatchHint")}
            </p>
          )}
          {errors.biasCountMismatch && (
            <p className="text-xs text-destructive">
              {t("simulationConfig.errorBiasCountMismatchHint")}
            </p>
          )}
          {errors.countsInvalid && (
            <p className="text-xs text-destructive">{t("simulationConfig.errorCountsInvalid")}</p>
          )}
          {errors.agentLimitExceeded && (
            <p className="text-xs text-destructive">{t("simulationConfig.errorAgentLimit")}</p>
          )}
        </div>
      )}
    </div>
  );
}
