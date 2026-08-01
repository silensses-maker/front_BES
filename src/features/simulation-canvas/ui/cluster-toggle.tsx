import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export type ClusterMode = "strategy" | "belief" | "effect";

interface ClusterToggleProps {
  activeMode: ClusterMode | null;
  onChange: (mode: ClusterMode | null) => void;
  disabled?: boolean;
  /** Grouping is suspended while rounds auto-advance (playback / live tail). */
  suspended?: boolean;
}

/** Returns true when running on a Windows host (detects via userAgent). */
function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

/**
 * "Agrupar" segmented control (mockup, top-left of the graph): Ninguno /
 * Estrategia / Creencia — plus Efecto, kept as a documented superset from #90.
 */
export function ClusterToggle({
  activeMode,
  onChange,
  disabled = false,
  suspended = false,
}: ClusterToggleProps) {
  const { t } = useTranslation();
  const onWindows = isWindows();

  const options: Array<{ mode: ClusterMode | null; label: string }> = [
    { mode: null, label: t("runView.groupNone") },
    { mode: "strategy", label: t("runView.groupStrategy") },
    { mode: "belief", label: t("runView.groupBelief") },
    { mode: "effect", label: t("runView.groupEffect") },
  ];

  return (
    <div className="absolute left-2.5 top-2.5 z-10 flex gap-0.75 rounded-lg border border-border bg-card p-0.75 shadow-sm">
      <span className="self-center px-1.5 font-sans text-[11px] text-muted-foreground">
        {t("runView.groupLabel")}
      </span>
      {options.map(({ mode, label }) => {
        const isActive = activeMode === mode;
        const isSuspended = mode !== null && suspended;
        const isDisabled = disabled || isSuspended;
        const showWarning = isActive && mode !== null && onWindows;

        const button = (
          <button
            key={mode ?? "none"}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(mode)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-2.5 font-sans text-[11.5px] font-medium",
              isActive ? "bg-accent font-semibold text-primary" : "text-muted-foreground",
              isDisabled && "cursor-not-allowed opacity-50",
            )}
          >
            {showWarning && <AlertTriangle className="h-3 w-3 text-warn" aria-hidden="true" />}
            {label}
          </button>
        );

        if (isSuspended) {
          // Radix tooltips don't fire on disabled elements — wrap in a span
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <span className="inline-flex">{button}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{t("runView.groupPlaybackTip")}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        if (showWarning) {
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{t("simulation.canvas.windowsClusterWarning")}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return button;
      })}
    </div>
  );
}
