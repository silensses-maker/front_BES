import ReactECharts from "echarts-for-react";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import {
  CATEGORY_COUNTS,
  isAlienationId,
  LITERATURE_MEASURES,
  MEASURES,
  type MeasureId,
  type MeasureParams,
  type ParamSpec,
  PROPOSED_MEASURES,
  supportsCategories,
} from "@/shared/lib/polarization";
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
  parseParamInput,
  rangeText,
} from "../lib/param-input";
import { polarizationOption } from "../lib/polarization-chart-option";
import {
  effectiveParams,
  usePolarizationSettingsStore,
} from "../model/polarization-settings.store";
import { usePolarizationSeries } from "../model/use-polarization-series";

const SEGMENT = "flex flex-none gap-0.5 rounded-lg border border-border bg-muted p-0.5";
const SEGMENT_BUTTON = "h-6 rounded-md px-2 font-sans text-[11.5px] font-medium";
const SEGMENT_ON = "bg-accent font-semibold text-primary";
const SEGMENT_OFF = "text-muted-foreground";

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
  measureId: MeasureId;
  spec: Exclude<ParamSpec, { kind: "choice" }>;
  value: number | null;
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

  const symbol = spec.key === "alpha" ? "α" : spec.key === "beta" ? "β" : "K";
  const range = rangeText(spec);
  const tip =
    spec.kind === "optional-number"
      ? t("polarization.paramKTip")
      : t("polarization.paramTip", {
          name: symbol,
          value: formatParamValue(spec.defaultValue),
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
            placeholder={spec.kind === "optional-number" ? t("polarization.paramAuto") : undefined}
            aria-label={t("polarization.paramAria", { name: symbol })}
            aria-invalid={invalid}
            onChange={(e) => {
              setText(e.target.value);
              const parsed = parseParamInput(spec, e.target.value);
              setInvalid(!parsed.ok);
              if (parsed.ok) setParams(measureId, { [spec.key]: parsed.value } as MeasureParams);
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

/**
 * "Polarización" view of the run charts card (#129): a pol_measures measure per round over the
 * k-category histogram of the private (default) or public beliefs, with the package's level for
 * the viewed round when thresholds exist. Loaded on demand by `PolarizationPanel`
 * (./lazy-polarization-panel.tsx), so ECharts and the measures stay out of the wiki's chunks.
 */
export function PolarizationPanelView() {
  const { t, i18n } = useTranslation();
  const theme = useChartTheme();
  const measureId = usePolarizationSettingsStore((s) => s.measureId);
  const paramsByMeasure = usePolarizationSettingsStore((s) => s.paramsByMeasure);
  const k = usePolarizationSettingsStore((s) => s.k);
  const belief = usePolarizationSettingsStore((s) => s.belief);
  const { setMeasure, setParams, resetParams, setK, setBelief } =
    usePolarizationSettingsStore.getState();

  const meta = MEASURES[measureId];
  const params = useMemo(
    () => effectiveParams(paramsByMeasure, measureId),
    [paramsByMeasure, measureId],
  );
  const spec = useMemo(() => ({ measureId, params, k, belief }), [measureId, params, k, belief]);
  const { series, seriesVersion, currentRound } = usePolarizationSeries(spec);

  const lang = i18n.language;
  const levelText = (label: string) => t(`polarization.levels.${label}`, { defaultValue: label });

  // biome-ignore lint/correctness/useExhaustiveDependencies: seriesVersion signals new values
  const points = useMemo(() => series?.points() ?? [], [series, seriesVersion]);
  const value = series?.valueAt(currentRound) ?? null;
  const level = value !== null ? (series?.classifier?.levelOf(value) ?? null) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: levelText only reads t
  const option = useMemo(() => {
    const classifier = series?.classifier ?? null;
    return polarizationOption({
      points,
      round: currentRound,
      thresholds:
        classifier === null
          ? []
          : classifier.thresholds.map((threshold, i) => ({
              value: threshold,
              label: levelText(classifier.labels[i + 1] ?? ""),
            })),
      seriesName: meta.name,
      theme,
      formatValue: (v) => v.toLocaleString(lang, { maximumFractionDigits: 3 }),
      formatTooltip: (round, v) => {
        const head = t("polarization.tooltipRound", { round: formatNumber(round, lang) });
        const shown = formatMeasureValue(v, lang);
        const lvl = v !== null ? classifier?.levelOf(v) : null;
        return `${head}<br/>${meta.name}: <b>${shown}</b>${lvl ? ` · ${levelText(lvl)}` : ""}`;
      },
    });
  }, [points, currentRound, series, meta.name, theme, lang, t]);

  const unsupported = series?.unavailable === "unsupported-categories";
  const invalidParams = series !== null && series.unavailable !== null && !unsupported;

  const measureItem = (id: MeasureId) => {
    const item = MEASURES[id];
    const enabled = supportsCategories(id, k);
    return (
      <SelectItem key={id} value={id} disabled={!enabled}>
        <span className="flex items-center">
          {item.name}
          {item.beta && <BetaBadge />}
          {!enabled && (
            <span className="ml-1.5 text-[10.5px] text-muted-foreground">
              {t("polarization.onlyFiveCategories")}
            </span>
          )}
        </span>
      </SelectItem>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-1.5">
        <Select value={measureId} onValueChange={(next) => setMeasure(next as MeasureId)}>
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
              {LITERATURE_MEASURES.map(measureItem)}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>{t("polarization.groupProposed")}</SelectLabel>
              {PROPOSED_MEASURES.map(measureItem)}
            </SelectGroup>
          </SelectContent>
        </Select>

        {meta.params.map((paramSpec) =>
          paramSpec.kind === "choice" ? (
            <Tooltip key={paramSpec.key}>
              <TooltipTrigger asChild>
                <span className="flex flex-none items-center gap-1 font-sans text-[11.5px] text-muted-foreground">
                  <span className="font-mono">f(d)</span>
                  <Select
                    value={params.alienation ?? paramSpec.defaultValue}
                    onValueChange={(next) => {
                      if (isAlienationId(next)) setParams(measureId, { alienation: next });
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
                          {alienationLabel(option)}
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
              key={`${measureId}-${paramSpec.key}`}
              measureId={measureId}
              spec={paramSpec}
              value={(params[paramSpec.key] as number | null | undefined) ?? null}
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
                disabled={paramsByMeasure[measureId] === undefined}
                onClick={() => resetParams(measureId)}
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
          <span>{t("polarization.valueAt", { round: formatNumber(currentRound, lang) })}</span>
          <span className="font-mono text-[12.5px] font-semibold text-foreground">
            {formatMeasureValue(value, lang)}
          </span>
          {series?.classifier ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className={cn(
                    "rounded-full px-2 py-px font-sans text-[11px] font-medium",
                    level === null
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/12 text-primary",
                  )}
                >
                  {level === null ? "—" : levelText(level)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("polarization.levelTip")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <InfoTooltip side="top" ariaLabel={t("polarization.aboutAria")}>
            {series?.classifier
              ? t("polarization.aboutWithLevels")
              : t("polarization.aboutNoLevels")}
          </InfoTooltip>
        </span>
      </div>

      {/* ── Chart ────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {unsupported || invalidParams ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center font-sans text-[12px] text-muted-foreground">
            <p>
              {unsupported
                ? t("polarization.unsupportedK", { name: meta.name })
                : t("polarization.invalidParams", { name: meta.name })}
            </p>
            {unsupported && (
              <Button type="button" variant="outline" size="xs" onClick={() => setK(5)}>
                {t("polarization.useFiveCategories")}
              </Button>
            )}
          </div>
        ) : (
          <ReactECharts option={option} notMerge={true} style={{ width: "100%", height: "100%" }} />
        )}
      </div>
    </div>
  );
}
