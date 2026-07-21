import { useTranslation } from "@/shared/i18n";
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
        <Label htmlFor="customNetworkName">{t("simulationConfig.customNetworkName")}</Label>
        <Input
          id="customNetworkName"
          type="text"
          placeholder={t("simulationConfig.customNetworkNamePlaceholder")}
          value={custom.networkName}
          onChange={(e) => onUpdate({ networkName: e.target.value } as Partial<SimFormValues>)}
        />
        {errors.customNetworkNameEmpty && (
          <p className="text-sm text-destructive">
            {t("simulationConfig.errorCustomNetworkNameEmpty")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="customSaveMode">{t("simulationConfig.saveMode")}</Label>
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
            <SelectItem value="2">{t("simulationConfig.saveModeDebug")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customIterationLimit">{t("simulationConfig.iterationLimit")}</Label>
        <Input
          id="customIterationLimit"
          type="number"
          min={1}
          max={maxIterations ?? undefined}
          value={custom.iterationLimit}
          onChange={(e) =>
            onUpdate({ iterationLimit: Number(e.target.value) } as Partial<SimFormValues>)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customStopThreshold">{t("simulationConfig.stopThreshold")}</Label>
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
