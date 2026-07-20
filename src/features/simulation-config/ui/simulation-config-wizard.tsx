import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { SidebarShell } from "@/shared/ui/sidebar-shell";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { CONSENSUS_PURSUIT_TEMPLATE, POLARIZATION_TEMPLATE } from "../lib/templates";
import { useSimulationConfig } from "../model/use-simulation-config";
import type { WizardStep } from "../types/simulation-config.types";
import { StepAgents } from "./step-agents";
import { StepAgentsCustom } from "./step-agents-custom";
import { StepLoad } from "./step-load";
import { StepNetwork } from "./step-network";
import { StepNetworkCustom } from "./step-network-custom";
import { StepReview } from "./step-review";

const STEP_ORDER: WizardStep[] = ["network", "agents", "review"];
const LOAD_STEP_ORDER: WizardStep[] = ["load", "agents", "review"];

const STEP_LABEL_KEYS: Record<WizardStep, string> = {
  network: "simulationConfig.stepNetwork",
  agents: "simulationConfig.stepAgents",
  review: "simulationConfig.stepReview",
  load: "simulationConfig.stepLoad",
};

export function SimulationConfigWizard() {
  const { t } = useTranslation();
  const {
    step,
    networkType,
    values,
    errors,
    loading,
    usageLimitError,
    activeTemplate,
    maxAgents,
    maxIterations,
    updateValues,
    setNetworkType,
    goToStep,
    validateAndAdvance,
    submit,
    applyTemplate,
    exportConfig,
    handleImportFile,
    loadFileAndAdvance,
  } = useSimulationConfig();

  const activeStepOrder = networkType === "load" ? LOAD_STEP_ORDER : STEP_ORDER;
  const currentIndex = activeStepOrder.indexOf(step);

  const handleNext = () => {
    if (!validateAndAdvance()) return;
    const next = activeStepOrder[currentIndex + 1];
    if (next) goToStep(next);
  };

  const handleBack = () => {
    const prev = activeStepOrder[currentIndex - 1];
    if (prev) goToStep(prev);
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const footer = (
    <div className="flex justify-between">
      <Button type="button" variant="outline" disabled={currentIndex === 0} onClick={handleBack}>
        {t("simulationConfig.back")}
      </Button>
      {step === "review" ? (
        <Button type="button" disabled={loading || hasErrors} onClick={submit}>
          {loading ? t("simulationConfig.submitting") : t("simulationConfig.submit")}
        </Button>
      ) : (
        <Button type="button" onClick={handleNext}>
          {t("simulationConfig.next")}
        </Button>
      )}
    </div>
  );

  return (
    <SidebarShell footer={footer}>
      <div className="flex flex-col gap-6 p-2">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("simulationConfig.subtitle")}</p>

          <Tabs
            value={networkType}
            onValueChange={(v) => setNetworkType(v as "generated" | "custom" | "load")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="generated" className="flex-1">
                {t("simulationConfig.networkTypeGenerated")}
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">
                {t("simulationConfig.networkTypeCustom")}
              </TabsTrigger>
              <TabsTrigger value="load" className="flex-1">
                {t("simulationConfig.networkTypeLoad")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {networkType !== "load" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("simulationConfig.quickStart")}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={activeTemplate === "consensus-pursuit" ? "default" : "outline"}
                  size="xs"
                  className="rounded-full"
                  onClick={() => applyTemplate("consensus-pursuit", CONSENSUS_PURSUIT_TEMPLATE)}
                >
                  {t("simulationConfig.templateConsensusPursuit")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("simulationConfig.templateConsensusPursuitTooltip")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={activeTemplate === "polarization" ? "default" : "outline"}
                  size="xs"
                  className="rounded-full"
                  onClick={() => applyTemplate("polarization", POLARIZATION_TEMPLATE)}
                >
                  {t("simulationConfig.templatePolarization")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("simulationConfig.templatePolarizationTooltip")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">
              {t(STEP_LABEL_KEYS[step] as Parameters<typeof t>[0])}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("simulationConfig.stepProgress", {
                current: String(currentIndex + 1),
                total: String(activeStepOrder.length),
              })}
            </span>
          </div>
          <div className="flex gap-1">
            {activeStepOrder.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  i <= currentIndex ? "bg-primary" : "bg-primary/20",
                )}
              />
            ))}
          </div>
        </div>

        <Card>
          <CardContent>
            {step === "load" && <StepLoad onLoad={loadFileAndAdvance} loading={loading} />}
            {step === "network" &&
              (networkType === "custom" ? (
                <StepNetworkCustom
                  values={values}
                  maxIterations={maxIterations}
                  errors={errors}
                  onUpdate={updateValues}
                />
              ) : (
                <StepNetwork
                  values={values}
                  maxAgents={maxAgents}
                  maxIterations={maxIterations}
                  errors={errors}
                  onUpdate={updateValues}
                />
              ))}
            {step === "agents" &&
              (networkType === "custom" ? (
                <StepAgentsCustom values={values} errors={errors} onUpdate={updateValues} />
              ) : (
                <StepAgents values={values} maxAgents={maxAgents} onUpdate={updateValues} />
              ))}
            {step === "review" && (
              <StepReview
                values={values}
                errors={errors}
                usageLimitError={usageLimitError}
                onExport={exportConfig}
                onImport={handleImportFile}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarShell>
  );
}
