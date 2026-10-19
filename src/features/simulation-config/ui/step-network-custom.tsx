import { useTranslation } from "@/shared/i18n";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MAX_CUSTOM_NAME_LENGTH } from "../lib/validation";
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
 * Custom-network header step. Per mockup asymmetry: the iteration field has no
 * quick-fix and the stop threshold has no inline error (validation still blocks
 * Next via toast). Deliberate deviation from the mockup (#133): no save-mode
 * select — the backend saves every run in DEBUG mode in this phase, and the
 * review step says what is stored instead.
 */
export function StepNetworkCustom({
  values,
  maxIterations,
  errors,
  onUpdate,
}: StepNetworkCustomProps) {
  const { t } = useTranslation();
  const custom = values as CustomSimFormValues;
  // maxLength stops typing past the limit; a longer name can still come from an older draft.
  const nameTooLong = custom.networkName.length > MAX_CUSTOM_NAME_LENGTH;

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
          maxLength={MAX_CUSTOM_NAME_LENGTH}
          aria-invalid={errors.customNetworkNameEmpty || nameTooLong || undefined}
          value={custom.networkName}
          onChange={(e) => onUpdate({ networkName: e.target.value } as Partial<SimFormValues>)}
        />
        {errors.customNetworkNameEmpty && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.errorCustomNetworkNameEmpty")}
          </p>
        )}
        {nameTooLong && (
          <p className="text-xs text-destructive">
            {t("simulationConfig.errorCustomNetworkNameTooLong", { max: MAX_CUSTOM_NAME_LENGTH })}
          </p>
        )}
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
