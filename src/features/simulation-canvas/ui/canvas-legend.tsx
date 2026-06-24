import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { OPINION_PALETTE } from "@/shared/lib/opinion-palette";
import { Button } from "@/shared/ui/button";
import type { CanvasView } from "./view-toggle";

interface CanvasLegendProps {
  view: CanvasView;
}

/**
 * Floating, collapsible legend for the static topology canvas (#99).
 * Shows the bipolar belief gradient for the active view. The speaking/silent
 * size legend is only meaningful in the Final view (all agents are silent at
 * t=0), so it is hidden when Initial is active.
 */
export function CanvasLegend({ view }: CanvasLegendProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const gradient = `linear-gradient(to right, ${OPINION_PALETTE.join(", ")})`;
  const title =
    view === "final"
      ? t("simulation.canvas.legendTitleFinal")
      : t("simulation.canvas.legendTitleInitial");

  return (
    <div className="absolute bottom-2 right-2 z-10 w-44 rounded-md border border-border bg-background/85 p-2 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="font-sans text-xs font-medium text-foreground">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={
            collapsed ? t("simulation.canvas.legendExpand") : t("simulation.canvas.legendCollapse")
          }
        >
          {collapsed ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Belief gradient */}
          <div>
            <div className="h-2 w-full rounded-sm" style={{ background: gradient }} />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{t("simulation.canvas.legendLowBelief")}</span>
              <span>{t("simulation.canvas.legendHighBelief")}</span>
            </div>
          </div>

          {/* Size legend — only meaningful in Final view */}
          {view === "final" && (
            <div className="flex flex-col gap-1 border-t border-border pt-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block shrink-0 rounded-full bg-muted-foreground"
                  style={{ width: 14, height: 14 }}
                  aria-hidden="true"
                />
                <span className="font-sans text-[11px] text-muted-foreground">
                  {t("simulation.canvas.legendSpeaking")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block shrink-0 rounded-full bg-muted-foreground"
                  style={{ width: 8, height: 8 }}
                  aria-hidden="true"
                />
                <span className="font-sans text-[11px] text-muted-foreground">
                  {t("simulation.canvas.legendSilent")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
