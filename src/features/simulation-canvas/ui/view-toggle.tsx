import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export type CanvasView = "initial" | "final";

interface ViewToggleProps {
  view: CanvasView;
  onChange: (view: CanvasView) => void;
  /** When false, the Final option is disabled (run not converged / no final frame). */
  finalEnabled: boolean;
}

/**
 * Segmented Initial / Final control for the static topology canvas (#99).
 * Mirrors {@link ClusterToggle} styling. The Final button is disabled until the
 * final frame is available, with a tooltip explaining why.
 */
export function ViewToggle({ view, onChange, finalEnabled }: ViewToggleProps) {
  const { t } = useTranslation();

  const pill = (mode: CanvasView, label: string, disabled: boolean) => (
    <Button
      key={mode}
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onChange(mode)}
      className={`
        rounded-full px-3 py-1.5 text-xs font-medium transition-colors
        ${view === mode ? "bg-primary/10 border-primary/30 text-primary" : ""}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      {label}
    </Button>
  );

  return (
    // Offset from the right edge so it clears the panel's maximize button
    // (rendered at `right-2 top-2` by the run view).
    <div className="absolute right-12 top-2 z-10 flex gap-1.5">
      {pill("initial", t("simulation.canvas.viewInitial"), false)}
      {finalEnabled ? (
        pill("final", t("simulation.canvas.viewFinal"), false)
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Wrapper span keeps the tooltip working on a disabled button. */}
            <span>{pill("final", t("simulation.canvas.viewFinal"), true)}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{t("simulation.canvas.finalUnavailableTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
