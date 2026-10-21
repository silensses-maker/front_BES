import { RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type {
  PolarizationCatalog,
  PolarizationMeasureInfo,
  PolarizationNumberParam,
  PolarizationParamValue,
} from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { CATEGORY_COUNTS } from "@/shared/lib/polarization";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
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
  formatParamValue,
  paramSymbol,
  parseParamInput,
  rangeText,
} from "../lib/param-input";
import type { ComparedSeries } from "../model/compared-series";
import { usePolarizationSettingsStore } from "../model/polarization-settings.store";
import { ROW, SEGMENT, SEGMENT_BUTTON, SEGMENT_OFF, SEGMENT_ON, SWATCH } from "./control-styles";

/**
 * The controls of one polarization series (#129): measure (grouped literature / proposed, with
 * the beta badge), its parameters as the server's catalog defines them, k and belief type. The
 * single-series view shows them as its toolbar; compared series show the selected one's.
 */

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
  spec,
  value,
  onChange,
}: {
  spec: PolarizationNumberParam;
  value: PolarizationParamValue;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
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
              if (parsed.ok) onChange(parsed.value);
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

function MeasureSelect({
  catalog,
  item,
  onChange,
}: {
  catalog: PolarizationCatalog;
  item: ComparedSeries;
  onChange: (measureId: string) => void;
}) {
  const { t } = useTranslation();
  const k = item.config.k;
  const literature = catalog.measures.filter((m) => m.kind === "literature");
  const proposed = catalog.measures.filter((m) => m.kind === "proposed");

  const measureItem = (option: PolarizationMeasureInfo) => {
    const enabled = option.categories.includes(k);
    const offered = CATEGORY_COUNTS.filter((count) => option.categories.includes(count));
    return (
      <SelectItem key={option.id} value={option.id} disabled={!enabled}>
        <span className="flex items-center">
          {option.name}
          {option.beta && <BetaBadge />}
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

  return (
    <Select value={item.meta.id} onValueChange={onChange}>
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
  );
}

function ParamControls({ catalog, item }: { catalog: PolarizationCatalog; item: ComparedSeries }) {
  const { t } = useTranslation();
  const { setParams, resetParams } = usePolarizationSettingsStore.getState();
  const { config, meta, params } = item;
  const id = config.id;

  return (
    <>
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
                      setParams(id, meta.id, { [paramSpec.name]: next });
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
            key={`${id}-${meta.id}-${paramSpec.name}`}
            spec={paramSpec}
            value={params[paramSpec.name] ?? null}
            onChange={(value) => setParams(id, meta.id, { [paramSpec.name]: value })}
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
              disabled={config.paramsByMeasure[meta.id] === undefined}
              onClick={() => resetParams(id, meta.id)}
            >
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("polarization.resetParamsTip")}</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

function CategorySegment({ item }: { item: ComparedSeries }) {
  const { t } = useTranslation();
  const setK = usePolarizationSettingsStore((s) => s.setK);
  const { id, k } = item.config;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="group" aria-label={t("polarization.kAria")} className={SEGMENT}>
          <span className="self-center px-1 font-mono text-[11px] text-muted-foreground">k</span>
          {CATEGORY_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={k === count}
              onClick={() => setK(id, count)}
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
  );
}

function BeliefSegment({ item }: { item: ComparedSeries }) {
  const { t } = useTranslation();
  const setBelief = usePolarizationSettingsStore((s) => s.setBelief);
  const { id, belief } = item.config;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="group" aria-label={t("polarization.beliefAria")} className={SEGMENT}>
          {(["private", "public"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={belief === kind}
              onClick={() => setBelief(id, kind)}
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
  );
}

/** The selected series' controls: measure, parameters, k, belief (and `children` after them). */
export function SeriesConfigRow({
  catalog,
  item,
  compare,
  id,
  hidden = false,
  children,
}: {
  catalog: PolarizationCatalog;
  item: ComparedSeries;
  /** Several series: the row is labelled with the series it configures and its colour. */
  compare: boolean;
  id?: string;
  /** Collapsed (its chip toggles it); kept in the DOM for the chip's aria-controls. */
  hidden?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const setMeasure = usePolarizationSettingsStore((s) => s.setMeasure);
  return (
    <div
      id={id}
      hidden={hidden}
      role={compare ? "group" : undefined}
      aria-label={compare ? t("polarization.configAria", { label: item.label }) : undefined}
      className={ROW}
    >
      {compare ? (
        <span aria-hidden="true" className={SWATCH} style={{ backgroundColor: item.color }} />
      ) : null}
      <MeasureSelect
        catalog={catalog}
        item={item}
        onChange={(measureId) => setMeasure(item.config.id, measureId)}
      />
      <ParamControls catalog={catalog} item={item} />
      <span className="mx-0.5 h-[18px] w-px bg-border" aria-hidden="true" />
      <CategorySegment item={item} />
      <BeliefSegment item={item} />
      {children}
    </div>
  );
}
