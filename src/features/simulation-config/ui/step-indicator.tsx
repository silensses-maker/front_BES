import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { WizardStep } from "../types/simulation-config.types";

interface StepIndicatorProps {
  steps: Array<{ key: WizardStep; label: string }>;
  currentIndex: number;
  /** Fired only for COMPLETED steps (mockup: current/future are inert). */
  onStepClick: (step: WizardStep) => void;
}

/**
 * Wizard step indicator (mockup): per-step label above a 5px bar — primary for
 * done/current, accent for future — with completed steps clickable to jump
 * back, plus the trailing "Paso N de 3" caption.
 */
export function StepIndicator({ steps, currentIndex, onStepClick }: StepIndicatorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-end gap-1.5">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const barClass = cn(
          "block h-[5px] w-full rounded-full",
          i <= currentIndex ? "bg-primary" : "bg-accent",
        );
        const labelClass = cn(
          "mb-1 block font-sans text-xs font-semibold",
          i === currentIndex ? "text-foreground" : "text-muted-foreground",
        );
        return isDone ? (
          <button
            key={step.key}
            type="button"
            aria-label={step.label}
            onClick={() => onStepClick(step.key)}
            className="flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={labelClass}>{step.label}</span>
            <span className={barClass} aria-hidden="true" />
          </button>
        ) : (
          <div key={step.key} className="flex-1">
            <span className={labelClass}>{step.label}</span>
            <span className={barClass} aria-hidden="true" />
          </div>
        );
      })}
      <span className="shrink-0 pb-px font-sans text-[11px] text-muted-foreground">
        {t("simulationConfig.stepProgress", {
          current: currentIndex + 1,
          total: steps.length,
        })}
      </span>
    </div>
  );
}
