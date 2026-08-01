import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export type ClusterMode = "strategy" | "belief" | "effect";

interface ClusterToggleProps {
  activeMode: ClusterMode | null;
  onToggle: (mode: ClusterMode) => void;
  disabled?: boolean;
}

/** Returns true when running on a Windows host (detects via userAgent). */
function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

export function ClusterToggle({ activeMode, onToggle, disabled = false }: ClusterToggleProps) {
  const { t } = useTranslation();
  const onWindows = isWindows();

  const modes: ClusterMode[] = ["strategy", "belief", "effect"];
  const labels: Record<ClusterMode, string> = {
    strategy: t("simulation.canvas.clusterByStrategy"),
    belief: t("simulation.canvas.clusterByBelief"),
    effect: t("simulation.canvas.clusterByEffect"),
  };

  return (
    <div className="absolute left-2 top-2 z-10 flex gap-1.5">
      {modes.map((mode) => {
        const isActive = activeMode === mode;

        const button = (
          <Button
            key={mode}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onToggle(mode)}
            className={`
              flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
              transition-colors
              ${isActive ? "bg-primary/10 border-primary/30 text-primary" : ""}
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {isActive && onWindows && (
              <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />
            )}
            {labels[mode]}
          </Button>
        );

        if (isActive && onWindows) {
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
