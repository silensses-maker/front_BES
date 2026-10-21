import { ChevronDown, Download } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { type BeliefKind, CATEGORY_COUNTS, type CategoryCount } from "@/shared/lib/polarization";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { CsvFormat } from "../lib/polarization-csv";
import { polarizationErrorKey } from "../lib/polarization-error";
import {
  type PolarizationView,
  type TableMode,
  usePolarizationSettingsStore,
} from "../model/polarization-settings.store";
import type { TableColumn } from "../model/table-columns";
import { SEGMENT, SEGMENT_BUTTON, SEGMENT_OFF, SEGMENT_ON } from "./control-styles";

/**
 * The controls of the polarization table (#129): the Chart | Table toggle (shown in both views),
 * the table's mode (series / all measures), the k and belief type of "all measures", the CSV
 * export menu (long or wide) with its partial-export note, and the failed measures' notices.
 */

interface SegmentOption<T> {
  value: T;
  label: string;
}

/** A segmented control of real buttons (aria-pressed), with its tooltip. */
function Segment<T extends string | number>({
  label,
  tip,
  prefix,
  options,
  value,
  onChange,
}: {
  label: string;
  tip: string;
  prefix?: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="group" aria-label={label} className={SEGMENT}>
          {prefix ? (
            <span className="self-center px-1 font-mono text-[11px] text-muted-foreground">
              {prefix}
            </span>
          ) : null}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
              className={cn(SEGMENT_BUTTON, value === option.value ? SEGMENT_ON : SEGMENT_OFF)}
            >
              {option.label}
            </button>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ViewToggle() {
  const { t } = useTranslation();
  const view = usePolarizationSettingsStore((s) => s.view);
  const setView = usePolarizationSettingsStore((s) => s.setView);
  const options: ReadonlyArray<SegmentOption<PolarizationView>> = [
    { value: "chart", label: t("polarization.viewChart") },
    { value: "table", label: t("polarization.viewTable") },
  ];
  return (
    <Segment
      label={t("polarization.viewAria")}
      tip={t("polarization.viewTip")}
      options={options}
      value={view}
      onChange={setView}
    />
  );
}

export function TableModeSwitch() {
  const { t } = useTranslation();
  const mode = usePolarizationSettingsStore((s) => s.tableMode);
  const setTableMode = usePolarizationSettingsStore((s) => s.setTableMode);
  const options: ReadonlyArray<SegmentOption<TableMode>> = [
    { value: "series", label: t("polarization.table.modeSeries") },
    { value: "all", label: t("polarization.table.modeAll") },
  ];
  return (
    <Segment
      label={t("polarization.table.modeAria")}
      tip={t("polarization.table.modeTip")}
      options={options}
      value={mode}
      onChange={setTableMode}
    />
  );
}

/** k and belief type of "all measures" (`k` / `belief`: the values in use, defaults included). */
export function AllMeasuresControls({ k, belief }: { k: CategoryCount; belief: BeliefKind }) {
  const { t } = useTranslation();
  const setAllMeasuresK = usePolarizationSettingsStore((s) => s.setAllMeasuresK);
  const setAllMeasuresBelief = usePolarizationSettingsStore((s) => s.setAllMeasuresBelief);
  const tip = t("polarization.table.allTip");
  return (
    <>
      <Segment
        label={t("polarization.table.allKAria")}
        tip={tip}
        prefix="k"
        options={CATEGORY_COUNTS.map((count) => ({ value: count, label: String(count) }))}
        value={k}
        onChange={setAllMeasuresK}
      />
      <Segment
        label={t("polarization.table.allBeliefAria")}
        tip={tip}
        options={[
          { value: "private", label: t("polarization.beliefPrivate") },
          { value: "public", label: t("polarization.beliefPublic") },
        ]}
        value={belief}
        onChange={setAllMeasuresBelief}
      />
    </>
  );
}

/** "Partial": the export holds only the rounds computed so far (live run, or still computing). */
export function PartialNote({ live }: { live: boolean }) {
  const { t } = useTranslation();
  const text = live
    ? t("polarization.table.partialLive")
    : t("polarization.table.partialComputing");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex-none rounded-full bg-warn/15 px-2 py-px font-sans text-[10.5px] font-semibold text-warn">
          <span>{t("polarization.table.partial")}</span>
          <span className="sr-only">: {text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** One "Export CSV" button with a menu: long (R / pandas) or wide (Excel). */
export function ExportMenu({
  disabled,
  partial,
  live,
  onExport,
}: {
  disabled: boolean;
  partial: boolean;
  live: boolean;
  onExport: (format: CsvFormat) => void;
}) {
  const { t } = useTranslation();
  const mode = usePolarizationSettingsStore((s) => s.tableMode);
  const modeText =
    mode === "all" ? t("polarization.table.modeAll") : t("polarization.table.modeSeries");
  const items: ReadonlyArray<{ format: CsvFormat; label: string; hint: string }> = [
    {
      format: "long",
      label: t("polarization.table.exportLong"),
      hint: t("polarization.table.exportLongHint"),
    },
    {
      format: "wide",
      label: t("polarization.table.exportWide"),
      hint: t("polarization.table.exportWideHint"),
    },
  ];
  let partialText: string | null = null;
  if (partial) {
    partialText = live
      ? t("polarization.table.partialLive")
      : t("polarization.table.partialComputing");
  }
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The wrapper keeps the tooltip working while the button is disabled */}
          <span className="inline-flex flex-none">
            <DropdownMenuTrigger asChild disabled={disabled}>
              <Button type="button" variant="outline" size="xs" className="h-6">
                <Download aria-hidden="true" />
                {t("polarization.table.export")}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {disabled
            ? t("polarization.table.exportEmpty")
            : t("polarization.table.exportTip", { mode: modeText })}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-w-72">
        {partialText === null ? null : (
          <DropdownMenuLabel className="font-sans text-[11px] font-normal text-warn">
            {partialText}
          </DropdownMenuLabel>
        )}
        {items.map((item) => (
          <DropdownMenuItem
            key={item.format}
            onSelect={() => onExport(item.format)}
            className="flex-col items-start gap-0"
          >
            <span className="font-sans text-[12px] font-medium">{item.label}</span>
            <span className="font-sans text-[11px] text-muted-foreground">{item.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A measure of "all measures" whose request failed or was rejected, with its retry. */
export function MeasureNotices({
  columns,
  onRetry,
}: {
  columns: readonly TableColumn[];
  onRetry: (listIndex: number) => void;
}) {
  const { t } = useTranslation();
  const failed = columns.filter((column) => column.series?.status === "error");
  if (failed.length === 0) return null;
  return (
    <ul className="flex flex-none flex-col gap-0.5 px-3 pt-1 font-sans text-[11px] text-muted-foreground">
      {failed.map((column) => {
        const error = column.series?.error ?? null;
        const invalid = error?.kind === "invalid";
        const text = invalid
          ? t("polarization.invalidParams", { name: column.meta.name })
          : t(polarizationErrorKey(error));
        return (
          <li key={column.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-medium text-foreground">{column.label}:</span>
            <span>{text}</span>
            {error?.message ? <span className="opacity-80">({error.message})</span> : null}
            {invalid || error?.kind === "disabled" ? null : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-5"
                onClick={() => onRetry(column.listIndex)}
              >
                {t("polarization.retry")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
