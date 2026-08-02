import { useTranslation } from "@/shared/i18n";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type {
  CustomSimFormValues,
  SimConfigValidationErrors,
  SimFormValues,
} from "../types/simulation-config.types";

interface StepNetworkCustomProps {
  values: SimFormValues;
  maxIterations: number | null;
  errors: SimConfigValidationErrors;
  onUpdate: (patch: Partial<SimFormValues>) => void;
}

/**
 * Custom-network header step. Per mockup asymmetry: the save-mode select has
 * no description line, the iteration field has no quick-fix, and the stop
 * threshold has no inline error (validation still blocks Next via toast).
 */
export function StepNetworkCustom({
  values,
  maxIterations,
  errors,
  onUpdate,
}: StepNetworkCustomProps) {
  const { t } = useTranslation();
  const custom = values as CustomSimFormValues;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="customNetworkName" className="flex items-center gap-1.5">
          {t("simulationConfig.customNetworkName")}
          <InfoTooltip>{t("simulationConfig.customNetworkNameHint")}</InfoTooltip>
        </Label>
        <Input
          id="customNetworkName"
          type="text"
          placeholder={t("simulationConfig.customNetworkNamePlaceholder")}
          aria-invalid={errors.customNetworkNameEmpty || undefined}
          value={custom.networkName}
          onChange={(e) => onUpdate({ networkName: e.target.value } as Partial<SimFormValues>)}
        />
        {errors.customNetworkNameEmpty && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.errorCustomNetworkNameEmpty")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="customSaveMode" className="flex items-center gap-1.5">
          {t("simulationConfig.saveMode")}
          <InfoTooltip>{t("simulationConfig.saveModeHint")}</InfoTooltip>
        </Label>
        <Select
          value={String(custom.saveMode)}
          onValueChange={(v) =>
            onUpdate({ saveMode: Number(v) as 0 | 1 | 2 } as Partial<SimFormValues>)
          }
        >
          <SelectTrigger id="customSaveMode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("simulationConfig.saveModeFull")}</SelectItem>
            <SelectItem value="1">{t("simulationConfig.saveModeStandard")}</SelectItem>
            <SelectItem value="2">{t("simulationConfig.saveModeLight")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customIterationLimit" className="flex items-center gap-1.5">
          {t("simulationConfig.iterationLimit")}
          <InfoTooltip>{t("simulationConfig.iterationLimitHint")}</InfoTooltip>
        </Label>
        <Input
          id="customIterationLimit"
          type="number"
          min={1}
          aria-invalid={errors.iterationLimitExceeded || undefined}
          value={custom.iterationLimit}
          onChange={(e) =>
            onUpdate({ iterationLimit: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
        {errors.iterationLimitExceeded && maxIterations !== null && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.errorAgentLimitInline", { limit: String(maxIterations) })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="customStopThreshold" className="flex items-center gap-1.5">
          {t("simulationConfig.stopThreshold")}
          <InfoTooltip>{t("simulationConfig.stopThresholdHint")}</InfoTooltip>
        </Label>
        <Input
          id="customStopThreshold"
          type="number"
          min={0.0001}
          max={0.9999}
          step={0.001}
          value={custom.stopThreshold}
          onChange={(e) =>
            onUpdate({ stopThreshold: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
      </div>
    </div>
  );
}
