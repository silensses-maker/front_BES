import ReactECharts from "echarts-for-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import type { PolarizationCatalog } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { useChartTheme } from "@/shared/lib/use-chart-theme";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { type AxisMode, valueRange } from "../lib/normalize";
import { formatMeasureValue } from "../lib/param-input";
import { type ChartSeriesInput, polarizationOption } from "../lib/polarization-chart-option";
import { polarizationErrorKey } from "../lib/polarization-error";
import { polarizationTooltip } from "../lib/polarization-tooltip";
import { registerPolarizationStrings } from "../lib/register-strings";
import { type ComparedSeries, compareSeries, problemOf } from "../model/compared-series";
import { usePolarizationCatalogStore } from "../model/polarization-catalog.store";
import type { PolarizationSeries } from "../model/polarization-series";
import { usePolarizationSettingsStore } from "../model/polarization-settings.store";
import { usePolarizationSeriesList } from "../model/use-polarization-series";
import {
  AddSeriesButton,
  AxisModeToggle,
  RoundValues,
  SeriesChip,
  SeriesNotice,
} from "./compare-controls";
import { ROW } from "./control-styles";
import { SeriesConfigRow } from "./series-config-row";

const MESSAGE =
  "flex h-full flex-col items-center justify-center gap-2 px-6 text-center font-sans text-[12px] text-muted-foreground";

/** Message + optional retry in place of the chart. */
function ChartMessage({
  text,
  detail,
  action,
}: {
  text: string;
  detail?: string | null;
  action?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className={MESSAGE} role="status">
      <p>{text}</p>
      {detail ? <p className="text-[11px] opacity-80">{detail}</p> : null}
      {action ? (
        <Button type="button" variant="outline" size="xs" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * "Polarización" view of the run charts card (#129): pol_measures measures per round over the
 * k-category histograms of the private (default) or public beliefs, computed on the SERVER by the
 * real package. One series shows its level for the viewed round and the package's thresholds;
 * up to MAX_SERIES series, each with its own measure, parameters, k and belief type, can be
 * overlaid to compare them (on the real axis or normalized to their shape). The measures, their
 * parameters, defaults, ranges and supported k come from the server's catalog (loaded once per
 * session). Loaded on demand by `PolarizationPanel` (./lazy-polarization-panel.tsx).
 */
export function PolarizationPanelView() {
  registerPolarizationStrings();
  const { t } = useTranslation();
  const status = usePolarizationCatalogStore((s) => s.status);
  const catalog = usePolarizationCatalogStore((s) => s.catalog);
  const error = usePolarizationCatalogStore((s) => s.error);
  const load = usePolarizationCatalogStore((s) => s.load);
  const errorText = t(polarizationErrorKey(error));

  useEffect(() => {
    void load();
  }, [load]);

  if (catalog !== null && catalog.measures.length > 0) return <CatalogView catalog={catalog} />;
  if (catalog !== null) return <ChartMessage text={errorText} />;
  if (status === "error") {
    return (
      <ChartMessage
        text={errorText}
        detail={error?.message}
        action={
          error?.kind === "disabled" ? null : { label: t("polarization.retry"), onClick: load }
        }
      />
    );
  }
  return <ChartMessage text={t("polarization.catalogLoading")} />;
}

// ─── The view ─────────────────────────────────────────────────────────────────────────────────

interface ChartLine extends ChartSeriesInput {
  series: PolarizationSeries;
}

function CatalogView({ catalog }: { catalog: PolarizationCatalog }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const theme = useChartTheme();
  const configs = usePolarizationSettingsStore((s) => s.series);
  const selectedId = usePolarizationSettingsStore((s) => s.selectedId);
  const axisMode = usePolarizationSettingsStore((s) => s.axisMode);
  const { addSeries, selectSeries, setK } = usePolarizationSettingsStore.getState();
  const [configOpen, setConfigOpen] = useState(true);
  const configId = useId();

  const compared = useMemo(
    () =>
      compareSeries(
        catalog.measures,
        configs,
        {
          lang,
          belief: (belief) =>
            belief === "private"
              ? t("polarization.beliefShortPrivate")
              : t("polarization.beliefShortPublic"),
          auto: t("polarization.paramAuto"),
          alienations: catalog.alienations,
        },
        theme.series,
      ),
    [catalog, configs, lang, t, theme.series],
  );
  const entries = useMemo(
    () => compared.map((item) => ({ id: item.config.id, spec: item.spec })),
    [compared],
  );
  const { series, seriesVersion, currentRound, retry } = usePolarizationSeriesList(entries);

  const compare = compared.length > 1;
  const mode: AxisMode = compare ? axisMode : "values";
  const selectedIndex = Math.max(
    0,
    compared.findIndex((item) => item.config.id === selectedId),
  );
  const selected = compared[selectedIndex] as ComparedSeries;
  const levelText = (label: string) => t(`polarization.levels.${label}`, { defaultValue: label });

  // The drawn lines: the series that have a model (a measure not defined for k has none)
  // biome-ignore lint/correctness/useExhaustiveDependencies: seriesVersion signals new values
  const lines = useMemo(
    () =>
      compared.flatMap((item, index): ChartLine[] => {
        const model = series[index] ?? null;
        if (model === null) return [];
        const points = model.points();
        return [
          { name: item.label, color: item.color, points, range: valueRange(points), series: model },
        ];
      }),
    [compared, series, seriesVersion],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: levelText only reads t
  const option = useMemo(() => {
    const classification = compare ? null : (lines[0]?.series.classification ?? null);
    return polarizationOption({
      series: lines,
      compare,
      round: currentRound,
      thresholds:
        classification === null
          ? []
          : classification.thresholds.map((threshold, i) => ({
              value: threshold,
              label: levelText(classification.levels[i + 1] ?? ""),
            })),
      axisMode: mode,
      theme,
      formatValue: (v) =>
        v.toLocaleString(lang, { maximumFractionDigits: mode === "normalized" ? 2 : 3 }),
      formatTooltip: (round, indices) => {
        const shown = indices.length > 0 ? indices.map((i) => lines[i] as ChartLine) : lines;
        return polarizationTooltip(
          t("polarization.tooltipRound", { round: formatNumber(round, lang) }),
          shown.map((line) => {
            const value = line.series.valueAt(round);
            return {
              name: compare ? line.name : selected.meta.name,
              color: line.color,
              value,
              level: value === null ? null : line.series.levelAt(round),
              range: line.range,
            };
          }),
          { compare, axisMode: mode },
          {
            lang,
            level: levelText,
            realValue: (value) => t("polarization.tooltipValue", { value }),
            normalized: t("polarization.axisNormalized"),
          },
        );
      },
    });
  }, [lines, compare, mode, currentRound, selected.meta.name, theme, lang, t]);

  const chartElement = (
    <ReactECharts option={option} notMerge={true} style={{ width: "100%", height: "100%" }} />
  );
  const computing = (
    <span
      role="status"
      aria-label={t("polarization.computingAria")}
      className="animate-pulse text-[11px]"
    >
      {t("polarization.computing")}
    </span>
  );
  const roundText = (
    <span>{t("polarization.valueAt", { round: formatNumber(currentRound, lang) })}</span>
  );

  // ── One series: the view as it was before the comparison ──────────────────────────────────
  if (!compare) {
    const model = series[0] ?? null;
    const value = model?.valueAt(currentRound) ?? null;
    const level = value === null ? null : (model?.levelAt(currentRound) ?? null);
    const classification = model?.classification ?? null;
    const status = model?.status ?? "idle";
    const error = model?.error ?? null;

    let chart: ReactNode;
    if (!selected.supported) {
      const firstK = selected.firstSupportedK;
      chart = (
        <ChartMessage
          text={t("polarization.unsupportedK", { name: selected.meta.name, k: selected.config.k })}
          action={
            firstK === null
              ? null
              : {
                  label: t("polarization.useCategories", { k: firstK }),
                  onClick: () => setK(selected.config.id, firstK),
                }
          }
        />
      );
    } else if (status === "error" && error?.kind === "invalid") {
      chart = (
        <ChartMessage
          text={t("polarization.invalidParams", { name: selected.meta.name })}
          detail={error.message}
        />
      );
    } else if (status === "error") {
      chart = (
        <ChartMessage
          text={t(polarizationErrorKey(error))}
          detail={error?.message}
          action={
            error?.kind === "disabled"
              ? null
              : { label: t("polarization.retry"), onClick: () => retry(0) }
          }
        />
      );
    } else {
      chart = chartElement;
    }

    return (
      <div className="flex h-full flex-col">
        <SeriesConfigRow catalog={catalog} item={selected} compare={false}>
          <AddSeriesButton count={compared.length} onAdd={addSeries} />
          <span className="min-w-2 flex-1" />
          {/* ── Viewed-round value + level ─────────────────── */}
          <span className="flex flex-none items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
            {selected.supported && status === "loading" ? computing : null}
            {roundText}
            <span className="font-mono text-[12.5px] font-semibold text-foreground">
              {formatMeasureValue(value, lang)}
            </span>
            {classification ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "cursor-default rounded-full px-2 py-px font-sans text-[11px] font-medium",
                      level === null
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/12 text-primary",
                    )}
                  >
                    {level === null ? "—" : levelText(level)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {t("polarization.levelTip")}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <InfoTooltip side="top" ariaLabel={t("polarization.aboutAria")}>
              {classification ? t("polarization.aboutWithLevels") : t("polarization.aboutNoLevels")}
            </InfoTooltip>
          </span>
        </SeriesConfigRow>
        <div className="relative min-h-0 flex-1">{chart}</div>
      </div>
    );
  }

  // ── Several series: chips, the selected one's settings, per-series notices ───────────────
  const problems = compared.map((item, index) => problemOf(item, series[index] ?? null));
  const loading = series.some((model) => model?.status === "loading");
  const openChip = (id: number) => {
    if (id === selected.config.id) {
      setConfigOpen((open) => !open);
      return;
    }
    selectSeries(id);
    setConfigOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className={ROW}>
        <div
          role="group"
          aria-label={t("polarization.seriesGroupAria")}
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          {compared.map((item, index) => (
            <SeriesChip
              key={item.config.id}
              item={item}
              selected={index === selectedIndex}
              expanded={index === selectedIndex && configOpen}
              problem={problems[index] !== null}
              controls={configId}
              onOpen={() => openChip(item.config.id)}
            />
          ))}
          <AddSeriesButton
            count={compared.length}
            onAdd={() => {
              addSeries();
              setConfigOpen(true);
            }}
          />
        </div>
        <span className="min-w-2 flex-1" />
        <AxisModeToggle mode={mode} />
        <span className="flex flex-none flex-wrap items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
          {loading ? computing : null}
          {roundText}
          <RoundValues compared={compared} series={series} round={currentRound} />
          <InfoTooltip side="top" ariaLabel={t("polarization.aboutAria")}>
            {t("polarization.aboutCompare")}
          </InfoTooltip>
        </span>
      </div>
      <SeriesConfigRow
        catalog={catalog}
        item={selected}
        compare={true}
        id={configId}
        hidden={!configOpen}
      />
      {problems.some((problem) => problem !== null) ? (
        <ul className="flex flex-none flex-col gap-0.5 px-3 pt-1 font-sans text-[11px] text-muted-foreground">
          {compared.map((item, index) => {
            const problem = problems[index] ?? null;
            if (problem === null) return null;
            return (
              <SeriesNotice
                key={item.config.id}
                item={item}
                problem={problem}
                onRetry={() => retry(index)}
              />
            );
          })}
        </ul>
      ) : null}
      <div className="relative min-h-0 flex-1">{chartElement}</div>
    </div>
  );
}
