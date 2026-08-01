import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { DIVERGENCE_PALETTE, OPINION_PALETTE } from "@/shared/lib/opinion-palette";
import { Button } from "@/shared/ui/button";
import type { ColorBy } from "./color-by-select";

interface CanvasLegendProps {
  colorBy: ColorBy;
  /** Strategy labels present in this network, in palette order. */
  strategyLegend: Array<{ label: string; color: string }>;
  /** Speaking/silent size legend only makes sense once a round is on screen. */
  showSpeakingLegend: boolean;
}

/**
 * Floating legend (mockup, bottom-right): belief/divergence gradient or
 * per-strategy dots depending on "Colorear por", plus the speaking/silent
 * size hint. Collapsible (superset over the mockup).
 */
export function CanvasLegend({ colorBy, strategyLegend, showSpeakingLegend }: CanvasLegendProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const isGradient = colorBy !== "estr";
  const gradient =
    colorBy === "div"
      ? `linear-gradient(to right, ${DIVERGENCE_PALETTE.join(", ")})`
      : `linear-gradient(to right, ${OPINION_PALETTE.join(", ")})`;
  const title =
    colorBy === "pub"
      ? t("runView.colorPublic")
      : colorBy === "priv"
        ? t("runView.colorPrivate")
        : colorBy === "div"
          ? t("runView.colorDivergence")
          : t("runView.colorStrategy");
  const [low, high] = colorBy === "div" ? ["0", "≥ 0.2"] : ["0", "1"];

  return (
    <div className="absolute bottom-2.5 right-2.5 z-10 w-44 rounded-lg border border-border bg-card/90 p-2.5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[11px] text-muted-foreground">{title}</span>
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
        <div className="mt-1.5 flex flex-col gap-1.5">
          {isGradient ? (
            <div>
              <div className="h-2 w-full rounded-sm" style={{ background: gradient }} />
              <div className="mt-0.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>{low}</span>
                <span>{high}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {strategyLegend.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1.5 py-px">
                  <span
                    className="size-2.25 flex-none rounded-full"
                    style={{ background: entry.color }}
                    aria-hidden="true"
                  />
                  <span className="font-sans text-[11px] text-muted-foreground">{entry.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Size legend — speaking agents render larger (#99 mechanism) */}
          {showSpeakingLegend && (
            <div className="flex flex-col gap-1 border-t border-border pt-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-3.5 shrink-0 rounded-full bg-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-sans text-[11px] text-muted-foreground">
                  {t("simulation.canvas.legendSpeaking")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground opacity-60"
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
