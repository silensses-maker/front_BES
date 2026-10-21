import { Layers, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { PolarizationMeasureInfo } from "@/shared/api/backend";
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
import { SEGMENT, SEGMENT_BUTTON, SEGMENT_OFF, SEGMENT_ON } from "./control-styles";
import { LineSample } from "./line-sample";

/**
 * The comparison controls of the polarization view (#129): the + and "overlay all measures"
 * buttons, the series chips (each opens its settings; × removes it), the y-axis mode, the
 * per-series notices (unsupported k, rejected parameters, a failed request with its retry) and
 * the viewed round's values. Each series is identified by its line sample (colour and dash).
 */

/** More series than this: compact chips (and values), so the chart keeps its height. */
export const FULL_CHIPS_MAX = 4;

/** How long the overlay's notice (with its undo) stays. */
const OVERLAY_TOAST_MS = 10_000;

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

/**
 * "Overlay all measures": replaces the series with every catalog measure defined for the
 * selected series' k (the package's defaults, its k and belief type, in catalog order, up to
 * MAX_SERIES). A notice says how many were overlaid and which were skipped (not defined for k,
 * e.g. Experts outside k = 5), with an Undo that puts the previous series back.
 */
export function OverlayAllButton({
  measures,
  selected,
  onOverlay,
}: {
  measures: readonly PolarizationMeasureInfo[];
  selected: ComparedSeries;
  /** After the overlay (e.g. folding the settings away, to leave the chart room). */
  onOverlay?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { k, belief } = selected.config;
  const beliefText =
    belief === "private"
      ? t("polarization.beliefShortPrivate")
      : t("polarization.beliefShortPublic");
  const available = measures.some((m) => m.categories.includes(k));
  const nameOf = (id: string) => measures.find((m) => m.id === id)?.name ?? id;

  const overlay = () => {
    const store = usePolarizationSettingsStore.getState();
    const result = store.overlayAllMeasures(measures);
    // No measure defined for k (the button is disabled then): nothing changed
    if (result.state.series === result.previous.series) return;
    onOverlay?.();
    const count = result.state.series.length;
    const notes: string[] = [];
    if (result.skipped.length > 0) {
      notes.push(
        t("polarization.overlaySkipped", {
          count: result.skipped.length,
          k,
          names: result.skipped.map(nameOf).join(", "),
        }),
      );
    }
    if (result.omitted.length > 0) {
      notes.push(
        t("polarization.overlayOmitted", {
          max: MAX_SERIES,
          names: result.omitted.map(nameOf).join(", "),
        }),
      );
    }
    toast.success(
      t("polarization.overlayToast", {
        count,
        display: formatNumber(count, i18n.language),
        k,
        belief: beliefText,
      }),
      {
        description: notes.length > 0 ? notes.join(" ") : undefined,
        duration: OVERLAY_TOAST_MS,
        action: {
          label: t("polarization.overlayUndo"),
          onClick: () => usePolarizationSettingsStore.getState().restoreList(result.previous),
        },
      },
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper keeps the tooltip working while the button is disabled */}
        <span className="inline-flex flex-none">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("polarization.overlayAria")}
            disabled={!available}
            onClick={overlay}
          >
            <Layers />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {available
          ? t("polarization.overlayTip", { k, belief: beliefText, max: MAX_SERIES })
          : t("polarization.overlayNone", { k })}
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
  compact,
  onOpen,
}: {
  item: ComparedSeries;
  selected: boolean;
  expanded: boolean;
  problem: boolean;
  controls: string;
  /** Many series: a lower chip with the short label (k and belief are shown once, aside). */
  compact: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const removeSeries = usePolarizationSettingsStore((s) => s.removeSeries);
  const name = t("polarization.seriesAria", { label: item.label });
  return (
    <span
      data-compact={compact ? "true" : undefined}
      className={cn(
        "flex max-w-full flex-none items-center rounded-full border font-sans",
        compact ? "h-[22px] text-[11px]" : "h-6 text-[11.5px]",
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
            className={cn(
              "flex h-full min-w-0 items-center rounded-full pr-1",
              compact ? "gap-1 pl-1.5" : "gap-1.5 pl-2",
            )}
          >
            <LineSample color={item.color} dash={item.dash} />
            <span className={cn("truncate", compact ? "max-w-[150px]" : "max-w-[220px]")}>
              {compact ? item.shortLabel : item.label}
            </span>
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
      <LineSample color={item.color} dash={item.dash} />
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

/** The viewed round's value of every compared series (identified by its line sample and name). */
export function RoundValues({
  compared,
  series,
  round,
  compact,
}: {
  compared: readonly ComparedSeries[];
  series: ReadonlyArray<PolarizationSeries | null>;
  round: number;
  /** Many series: tighter, smaller values. */
  compact: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <ul
      aria-label={t("polarization.valuesAria", { round: formatNumber(round, lang) })}
      className={cn("flex flex-wrap items-center gap-y-0.5", compact ? "gap-x-1.5" : "gap-x-2")}
    >
      {compared.map((item, index) => {
        const value = formatMeasureValue(series[index]?.valueAt(round) ?? null, lang);
        const label = t("polarization.valueOf", { label: item.label, value });
        return (
          <li key={item.config.id} title={label} className="flex items-center gap-1">
            <LineSample color={item.color} dash={item.dash} />
            <span className="sr-only">{item.label}: </span>
            <span
              className={cn(
                "font-mono font-semibold text-foreground",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
