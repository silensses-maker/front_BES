import { Plus, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { AxisMode } from "../lib/normalize";
import { formatMeasureValue } from "../lib/param-input";
import { polarizationErrorKey } from "../lib/polarization-error";
import type { ComparedSeries, SeriesProblem } from "../model/compared-series";
import type { PolarizationSeries } from "../model/polarization-series";
import { usePolarizationSettingsStore } from "../model/polarization-settings.store";
import { MAX_SERIES } from "../model/series-list";
import { SEGMENT, SEGMENT_BUTTON, SEGMENT_OFF, SEGMENT_ON, SWATCH } from "./control-styles";

/**
 * The comparison controls of the polarization view (#129): the + button, the series chips (each
 * opens its settings; × removes it), the y-axis mode, the per-series notices (unsupported k,
 * rejected parameters, a failed request with its retry) and the viewed round's values.
 */

export function AddSeriesButton({ count, onAdd }: { count: number; onAdd: () => void }) {
  const { t } = useTranslation();
  const full = count >= MAX_SERIES;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper keeps the tooltip working while the button is disabled */}
        <span className="inline-flex flex-none">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("polarization.addSeriesAria", { max: MAX_SERIES })}
            disabled={full}
            onClick={onAdd}
          >
            <Plus />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {full
          ? t("polarization.addSeriesLimit", { max: MAX_SERIES })
          : t("polarization.addSeriesTip", { max: MAX_SERIES })}
      </TooltipContent>
    </Tooltip>
  );
}

export function SeriesChip({
  item,
  selected,
  expanded,
  problem,
  controls,
  onOpen,
}: {
  item: ComparedSeries;
  selected: boolean;
  expanded: boolean;
  problem: boolean;
  controls: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const removeSeries = usePolarizationSettingsStore((s) => s.removeSeries);
  const name = t("polarization.seriesAria", { label: item.label });
  return (
    <span
      className={cn(
        "flex h-6 max-w-full flex-none items-center rounded-full border font-sans text-[11.5px]",
        selected
          ? "border-primary/40 bg-accent font-semibold text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={selected}
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={problem ? `${name}, ${t("polarization.seriesProblem")}` : name}
            onClick={onOpen}
            className="flex h-full min-w-0 items-center gap-1.5 rounded-full pr-1 pl-2"
          >
            <span aria-hidden="true" className={SWATCH} style={{ backgroundColor: item.color }} />
            <span className="max-w-[220px] truncate">{item.label}</span>
            {problem ? <TriangleAlert aria-hidden="true" className="size-3 text-warn" /> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {/* The full label (the chip truncates long ones) */}
          <span className="block font-medium">{item.label}</span>
          {t("polarization.seriesTip")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("polarization.removeSeriesAria", { label: item.label })}
            onClick={() => removeSeries(item.config.id)}
            className="mr-1 flex size-4 items-center justify-center rounded-full hover:bg-foreground/10 hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("polarization.removeSeriesTip")}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function AxisModeToggle({ mode }: { mode: AxisMode }) {
  const { t } = useTranslation();
  const setAxisMode = usePolarizationSettingsStore((s) => s.setAxisMode);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="group" aria-label={t("polarization.axisAria")} className={SEGMENT}>
          {(["values", "normalized"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setAxisMode(option)}
              className={cn(SEGMENT_BUTTON, mode === option ? SEGMENT_ON : SEGMENT_OFF)}
            >
              {option === "values"
                ? t("polarization.axisValues")
                : t("polarization.axisNormalized")}
            </button>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {t("polarization.axisTip")}
      </TooltipContent>
    </Tooltip>
  );
}

/** One line per compared series that has a problem, with its own action (k or retry). */
export function SeriesNotice({
  item,
  problem,
  onRetry,
}: {
  item: ComparedSeries;
  problem: SeriesProblem;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const setK = usePolarizationSettingsStore((s) => s.setK);
  let text: string;
  let detail: string | null = null;
  let action: { label: string; onClick: () => void } | null = null;
  if (problem.kind === "unsupported") {
    text = t("polarization.unsupportedK", { name: item.meta.name, k: item.config.k });
    const firstK = item.firstSupportedK;
    if (firstK !== null) {
      action = {
        label: t("polarization.useCategories", { k: firstK }),
        onClick: () => setK(item.config.id, firstK),
      };
    }
  } else if (problem.kind === "invalid") {
    text = t("polarization.invalidParams", { name: item.meta.name });
    detail = problem.message;
  } else {
    text = t(polarizationErrorKey(problem.error));
    detail = problem.error?.message ?? null;
    if (problem.error?.kind !== "disabled") {
      action = { label: t("polarization.retry"), onClick: onRetry };
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span aria-hidden="true" className={SWATCH} style={{ backgroundColor: item.color }} />
      <span className="font-medium text-foreground">{item.label}:</span>
      <span>{text}</span>
      {detail ? <span className="opacity-80">({detail})</span> : null}
      {action ? (
        <Button type="button" variant="outline" size="xs" className="h-5" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </li>
  );
}

/** The viewed round's value of every compared series (identified by its colour and name). */
export function RoundValues({
  compared,
  series,
  round,
}: {
  compared: readonly ComparedSeries[];
  series: ReadonlyArray<PolarizationSeries | null>;
  round: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <ul
      aria-label={t("polarization.valuesAria", { round: formatNumber(round, lang) })}
      className="flex flex-wrap items-center gap-x-2"
    >
      {compared.map((item, index) => {
        const value = formatMeasureValue(series[index]?.valueAt(round) ?? null, lang);
        const label = t("polarization.valueOf", { label: item.label, value });
        return (
          <li key={item.config.id} title={label} className="flex items-center gap-1">
            <span aria-hidden="true" className={SWATCH} style={{ backgroundColor: item.color }} />
            <span className="sr-only">{item.label}: </span>
            <span className="font-mono text-[12px] font-semibold text-foreground">{value}</span>
          </li>
        );
      })}
    </ul>
  );
}
