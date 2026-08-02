import { useCallback } from "react";
import type { TopologyResponse } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/ui/card";
import { type CompositionEntry, compositionBy } from "../lib/topology-composition";

/** Cycling categorical palette — chart tokens (same family as Resumen en vivo). */
const CHART_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

function CompositionBlock({
  title,
  entries,
  labelFor,
}: {
  title: string;
  entries: CompositionEntry[];
  labelFor: (value: number) => string;
}) {
  const { i18n } = useTranslation();
  return (
    <div>
      <p className="mb-1 font-sans text-[11.5px] text-muted-foreground">{title}</p>
      <div className="mb-1.5 flex h-2 overflow-hidden rounded-sm">
        {entries.map((entry, i) => (
          <div
            key={entry.value}
            className={cn("h-full", CHART_CLASSES[i % CHART_CLASSES.length])}
            style={{ width: `${entry.pct}%` }}
          />
        ))}
      </div>
      {entries.map((entry, i) => (
        <div key={entry.value} className="flex items-center gap-1.5 py-px text-[11.5px]">
          <span
            className={cn(
              "size-2.25 flex-none rounded-[3px]",
              CHART_CLASSES[i % CHART_CLASSES.length],
            )}
            aria-hidden="true"
          />
          <span className="flex-1 text-muted-foreground">{labelFor(entry.value)}</span>
          <span className="font-mono">{formatNumber(entry.count, i18n.language)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * "Composición" card (mockup, run sidebar): stacked bars + legend for the
 * network's agents grouped by strategy and by effect. Shared between the run
 * panel and the multi-network selector state (#112).
 */
export function NetworkCompositionCard({ topology }: { topology: TopologyResponse }) {
  const { t } = useTranslation();

  const strategyLabel = useCallback(
    (value: number): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceStrategy.degroot"),
        1: t("enums.silenceStrategy.majority"),
        2: t("enums.silenceStrategy.threshold"),
        3: t("enums.silenceStrategy.confidence"),
      };
      return map[value] ?? String(value);
    },
    [t],
  );
  const effectLabel = useCallback(
    (value: number): string => {
      const map: Record<number, string> = {
        0: t("enums.silenceEffect.degroot"),
        1: t("enums.silenceEffect.memory"),
        2: t("enums.silenceEffect.memoryless"),
      };
      return map[value] ?? String(value);
    },
    [t],
  );

  return (
    <Card className="gap-2.5 rounded-[10px] px-3.5 py-3">
      <p className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("runView.compositionTitle")}
      </p>
      <CompositionBlock
        title={t("runView.compositionByStrategy")}
        entries={compositionBy(topology.agents, "silenceStrategy")}
        labelFor={strategyLabel}
      />
      <CompositionBlock
        title={t("runView.compositionByEffect")}
        entries={compositionBy(topology.agents, "silenceEffect")}
        labelFor={effectLabel}
      />
    </Card>
  );
}
