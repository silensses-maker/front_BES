import ReactECharts from "echarts-for-react";
import { RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  PolarizationCatalog,
  PolarizationMeasureInfo,
  PolarizationNumberParam,
  PolarizationParamValue,
} from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { CATEGORY_COUNTS, type CategoryCount } from "@/shared/lib/polarization";
import { useChartTheme } from "@/shared/lib/use-chart-theme";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { InfoTooltip } from "@/shared/ui/info-tooltip";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  alienationLabel,
  formatMeasureValue,
  formatParamValue,
  paramSymbol,
  parseParamInput,
  rangeText,
} from "../lib/param-input";
import { polarizationOption } from "../lib/polarization-chart-option";
import type { PolarizationErrorInfo } from "../lib/polarization-error";
import { registerPolarizationStrings } from "../lib/register-strings";
import { usePolarizationCatalogStore } from "../model/polarization-catalog.store";
import {
  effectiveParams,
  selectedMeasure,
  usePolarizationSettingsStore,
} from "../model/polarization-settings.store";
import { usePolarizationSeries } from "../model/use-polarization-series";

const SEGMENT = "flex flex-none gap-0.5 rounded-lg border border-border bg-muted p-0.5";
const SEGMENT_BUTTON = "h-6 rounded-md px-2 font-sans text-[11.5px] font-medium";
const SEGMENT_ON = "bg-accent font-semibold text-primary";
const SEGMENT_OFF = "text-muted-foreground";
const MESSAGE =
  "flex h-full flex-col items-center justify-center gap-2 px-6 text-center font-sans text-[12px] text-muted-foreground";

function BetaBadge() {
  const { t } = useTranslation();
  return (
    <span
      title={t("polarization.betaTip")}
      className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-px font-sans text-[9.5px] font-semibold tracking-wide text-warn"
    >
      {t("polarization.beta")}
    </span>
  );
}

/** One numeric parameter field: keeps the typed text, applies it only when valid. */
function NumberParamField({
  measureId,
  spec,
  value,
}: {
  measureId: string;
  spec: PolarizationNumberParam;
  value: PolarizationParamValue;
}) {
  const { t } = useTranslation();
  const setParams = usePolarizationSettingsStore((s) => s.setParams);
  const [text, setText] = useState(formatParamValue(value));
  const [invalid, setInvalid] = useState(false);

  // Follow external changes (reset to defaults, measure switch)
  useEffect(() => {
    setText(formatParamValue(value));
    setInvalid(false);
  }, [value]);

  const symbol = paramSymbol(spec.name);
  const range = rangeText(spec);
  const tip = spec.nullable
    ? t("polarization.paramKTip")
    : t("polarization.paramTip", {
        name: symbol,
        value: formatParamValue(spec.default),
        range,
      });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex flex-none items-center gap-1 font-sans text-[11.5px] text-muted-foreground">
          <span className="font-mono">{symbol}</span>
          <Input
            type="text"
            inputMode="decimal"
            value={text}
            placeholder={spec.nullable ? t("polarization.paramAuto") : undefined}
            aria-label={t("polarization.paramAria", { name: symbol })}
            aria-invalid={invalid}
            onChange={(e) => {
              setText(e.target.value);
              const parsed = parseParamInput(spec, e.target.value);
              setInvalid(!parsed.ok);
              if (parsed.ok) setParams(measureId, { [spec.name]: parsed.value });
            }}
            className="h-[26px] w-[58px] px-1.5 font-mono text-xs"
          />
        </label>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {invalid ? t("polarization.paramInvalid", { range }) : tip}
      </TooltipContent>
    </Tooltip>
  );
}

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

function useErrorText(error: PolarizationErrorInfo | null): string {
  const { t } = useTranslation();
  if (error?.kind === "disabled") return t("polarization.errorDisabled");
  if (error?.kind === "unavailable") return t("polarization.errorUnavailable");
  return t("polarization.errorGeneric");
}

/**
 * "Polarización" view of the run charts card (#129): a pol_measures measure per round over the
 * k-category histogram of the private (default) or public beliefs, computed on the SERVER by the
 * real package, with its level for the viewed round when thresholds apply. The measures, their
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
  const errorText = useErrorText(error);

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

function CatalogView({ catalog }: { catalog: PolarizationCatalog }) {
  const { t, i18n } = useTranslation();
  const theme = useChartTheme();
  const storedId = usePolarizationSettingsStore((s) => s.measureId);
  const paramsByMeasure = usePolarizationSettingsStore((s) => s.paramsByMeasure);
  const k = usePolarizationSettingsStore((s) => s.k);
  const belief = usePolarizationSettingsStore((s) => s.belief);
  const { setMeasure, setParams, resetParams, setK, setBelief } =
    usePolarizationSettingsStore.getState();

  // The catalog has at least one measure (PolarizationPanelView).
  const meta = selectedMeasure(catalog.measures, storedId) as PolarizationMeasureInfo;
  const params = useMemo(() => effectiveParams(meta, paramsByMeasure), [meta, paramsByMeasure]);
  const supported = meta.categories.includes(k);
  const spec = useMemo(
    () => (supported ? { measureId: meta.id, params, k, belief } : null),
    [supported, meta.id, params, k, belief],
  );
  const { series, seriesVersion, currentRound, retry } = usePolarizationSeries(spec);

  const lang = i18n.language;
  const levelText = (label: string) => t(`polarization.levels.${label}`, { defaultValue: label });

  // biome-ignore lint/correctness/useExhaustiveDependencies: seriesVersion signals new values
  const view = useMemo(() => {
    const value = series?.valueAt(currentRound) ?? null;
    return {
      points: series?.points() ?? [],
      value,
      level: value !== null ? (series?.levelAt(currentRound) ?? null) : null,
      classification: series?.classification ?? null,
      status: series?.status ?? "idle",
      error: series?.error ?? null,
      hasValues: series?.hasValues ?? false,
    };
  }, [series, seriesVersion, currentRound]);
  const seriesErrorText = useErrorText(view.error);

  // biome-ignore lint/correctness/useExhaustiveDependencies: levelText only reads t
  const option = useMemo(() => {
    const classification = view.classification;
    return polarizationOption({
      points: view.points,
      round: currentRound,
      thresholds:
        classification === null
          ? []
          : classification.thresholds.map((threshold, i) => ({
              value: threshold,
              label: levelText(classification.levels[i + 1] ?? ""),
            })),
      seriesName: meta.name,
      theme,
      formatValue: (v) => v.toLocaleString(lang, { maximumFractionDigits: 3 }),
      formatTooltip: (round, v) => {
        const head = t("polarization.tooltipRound", { round: formatNumber(round, lang) });
        const shown = formatMeasureValue(v, lang);
        // The package's level of that round, as the server answered it
        const lvl = v !== null ? (series?.levelAt(round) ?? null) : null;
        return `${head}<br/>${meta.name}: <b>${shown}</b>${lvl ? ` · ${levelText(lvl)}` : ""}`;
      },
    });
  }, [view, series, currentRound, meta.name, theme, lang, t]);

  /** First k the measure supports among the ones offered (Experts: 5). */
  const firstSupportedK = CATEGORY_COUNTS.find((count) => meta.categories.includes(count)) ?? null;
  const literature = catalog.measures.filter((m) => m.kind === "literature");
  const proposed = catalog.measures.filter((m) => m.kind === "proposed");

  const measureItem = (item: PolarizationMeasureInfo) => {
    const enabled = item.categories.includes(k);
    const offered = CATEGORY_COUNTS.filter((count) => item.categories.includes(count));
    return (
      <SelectItem key={item.id} value={item.id} disabled={!enabled}>
        <span className="flex items-center">
          {item.name}
          {item.beta && <BetaBadge />}
          {!enabled && (
            <span className="ml-1.5 text-[10.5px] text-muted-foreground">
              {offered.length === 1
                ? t("polarization.onlyCategories", { k: offered[0] })
                : t("polarization.notForK", { k })}
            </span>
          )}
        </span>
      </SelectItem>
    );
  };

  let chart: ReactNode;
  if (!supported) {
    chart = (
      <ChartMessage
        text={t("polarization.unsupportedK", { name: meta.name, k })}
        action={
          firstSupportedK === null
            ? null
            : {
                label: t("polarization.useCategories", { k: firstSupportedK }),
                onClick: () => setK(firstSupportedK as CategoryCount),
              }
        }
      />
    );
  } else if (view.status === "error" && view.error?.kind === "invalid") {
    chart = (
      <ChartMessage
        text={t("polarization.invalidParams", { name: meta.name })}
        detail={view.error.message}
      />
    );
  } else if (view.status === "error") {
    chart = (
      <ChartMessage
        text={seriesErrorText}
        detail={view.error?.message}
        action={
          view.error?.kind === "disabled"
            ? null
            : { label: t("polarization.retry"), onClick: retry }
        }
      />
    );
  } else {
    chart = (
      <ReactECharts option={option} notMerge={true} style={{ width: "100%", height: "100%" }} />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-1.5">
        <Select value={meta.id} onValueChange={(next) => setMeasure(next)}>
          <SelectTrigger
            size="sm"
            className="h-[26px] text-xs"
            aria-label={t("polarization.measureLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{t("polarization.groupLiterature")}</SelectLabel>
              {literature.map(measureItem)}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>{t("polarization.groupProposed")}</SelectLabel>
              {proposed.map(measureItem)}
            </SelectGroup>
          </SelectContent>
        </Select>

        {meta.params.map((paramSpec) =>
          paramSpec.type === "choice" ? (
            <Tooltip key={paramSpec.name}>
              <TooltipTrigger asChild>
                <span className="flex flex-none items-center gap-1 font-sans text-[11.5px] text-muted-foreground">
                  <span className="font-mono">f(d)</span>
                  <Select
                    value={String(params[paramSpec.name] ?? paramSpec.default)}
                    onValueChange={(next) => {
                      if (paramSpec.options.includes(next))
                        setParams(meta.id, { [paramSpec.name]: next });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-[26px] font-mono text-xs"
                      aria-label={t("polarization.alienationAria")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paramSpec.options.map((option) => (
                        <SelectItem key={option} value={option} className="font-mono">
                          {alienationLabel(catalog.alienations, option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("polarization.alienationTip")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <NumberParamField
              key={`${meta.id}-${paramSpec.name}`}
              measureId={meta.id}
              spec={paramSpec}
              value={params[paramSpec.name] ?? null}
            />
          ),
        )}
        {meta.params.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("polarization.resetParamsAria")}
                disabled={paramsByMeasure[meta.id] === undefined}
                onClick={() => resetParams(meta.id)}
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("polarization.resetParamsTip")}</TooltipContent>
          </Tooltip>
        )}

        <span className="mx-0.5 h-[18px] w-px bg-border" aria-hidden="true" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span role="group" aria-label={t("polarization.kAria")} className={SEGMENT}>
              <span className="self-center px-1 font-mono text-[11px] text-muted-foreground">
                k
              </span>
              {CATEGORY_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={k === count}
                  onClick={() => setK(count)}
                  className={cn(SEGMENT_BUTTON, k === count ? SEGMENT_ON : SEGMENT_OFF)}
                >
                  {count}
                </button>
              ))}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {t("polarization.kTip")}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span role="group" aria-label={t("polarization.beliefAria")} className={SEGMENT}>
              {(["private", "public"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={belief === kind}
                  onClick={() => setBelief(kind)}
                  className={cn(SEGMENT_BUTTON, belief === kind ? SEGMENT_ON : SEGMENT_OFF)}
                >
                  {kind === "private"
                    ? t("polarization.beliefPrivate")
                    : t("polarization.beliefPublic")}
                </button>
              ))}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {t("polarization.beliefTip")}
          </TooltipContent>
        </Tooltip>

        <span className="min-w-2 flex-1" />

        {/* ── Viewed-round value + level ───────────────────── */}
        <span className="flex flex-none items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
          {supported && view.status === "loading" ? (
            <span
              role="status"
              aria-label={t("polarization.computingAria")}
              className="animate-pulse text-[11px]"
            >
              {t("polarization.computing")}
            </span>
          ) : null}
          <span>{t("polarization.valueAt", { round: formatNumber(currentRound, lang) })}</span>
          <span className="font-mono text-[12.5px] font-semibold text-foreground">
            {formatMeasureValue(view.value, lang)}
          </span>
          {view.classification ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className={cn(
                    "rounded-full px-2 py-px font-sans text-[11px] font-medium",
                    view.level === null
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/12 text-primary",
                  )}
                >
                  {view.level === null ? "—" : levelText(view.level)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("polarization.levelTip")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <InfoTooltip side="top" ariaLabel={t("polarization.aboutAria")}>
            {view.classification
              ? t("polarization.aboutWithLevels")
              : t("polarization.aboutNoLevels")}
          </InfoTooltip>
        </span>
      </div>

      {/* ── Chart ────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">{chart}</div>
    </div>
  );
}
