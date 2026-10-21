import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { formatMeasureValue } from "../lib/param-input";
import { csvNumber } from "../lib/polarization-csv";
import {
  type TableCell as Cell,
  revealScrollTop,
  roundIndex,
  rowInView,
  shouldReveal,
  tableCell,
  visibleWindow,
} from "../lib/polarization-table";
import type { TableColumn } from "../model/table-columns";
import { LineSample } from "./line-sample";
import { BetaBadge } from "./series-config-row";

/**
 * The polarization table (#129): one row per round computed so far, a value column per series or
 * measure (plus its level column when it has thresholds). Virtualized with a fixed row height
 * (only the rows on screen are rendered, spacers stand for the rest), so thousands of rounds stay
 * cheap. The current round is highlighted (aria-current) and kept in view while playing or on a
 * seek, unless the user has scrolled it out of view; a row click seeks to its round.
 */

/** Fixed heights the virtualization relies on (rows have no borders: the lines are shadows). */
export const ROW_HEIGHT = 26;
export const HEADER_HEIGHT = 30;
const OVERSCAN = 8;
/** Viewport assumed until it is measured (and where layout reports none, e.g. tests). */
const DEFAULT_VIEWPORT = 320;
/** A scroll within this long of a wheel / touch / key / pointer event is the user's. */
const USER_SCROLL_MS = 800;
const USER_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

const LINE = "shadow-[inset_0_-1px_0_var(--color-border)]";
const HEAD = cn(
  "sticky top-0 z-2 h-[30px] whitespace-nowrap bg-muted px-2.5 py-0 font-sans text-[11px] font-semibold text-muted-foreground",
  LINE,
);
const CELL = cn("h-[26px] whitespace-nowrap px-2.5 py-0 text-right font-mono text-[12px]", LINE);

const heightOf = (element: HTMLElement) => element.clientHeight || DEFAULT_VIEWPORT;

/** The texts the cells need (resolved once per render, not per cell). */
interface CellText {
  lang: string;
  level: (id: string) => string;
  exact: (value: number) => string;
  pending: string;
  none: string;
  error: (message: string) => string;
  unsupported: (column: TableColumn) => string;
}

interface PolarizationTableProps {
  columns: readonly TableColumn[];
  /** Listed rounds, ascending. */
  rounds: readonly number[];
  currentRound: number;
  /** Seeks the run to a round (row click); without it rows are not clickable. */
  onSeekRound?: (round: number) => void;
  /** Shown below the header when no round is listed. */
  emptyText: string;
}

export function PolarizationTable({
  columns,
  rounds,
  currentRound,
  onSeekRound,
  emptyText,
}: PolarizationTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  /** Keep the current row in view (false once the user scrolls it out of view). */
  const following = useRef(true);
  const userScrollAt = useRef(Number.NEGATIVE_INFINITY);
  const previousRound = useRef<number | null>(null);
  const currentIndex = roundIndex(rounds, currentRound);
  const latest = useRef({ rounds, currentRound });
  latest.current = { rounds, currentRound };

  // The viewport height, and the user's scroll gestures (not the table's own scrolling)
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const measure = () => setViewport(heightOf(element));
    measure();
    const mark = () => {
      userScrollAt.current = performance.now();
    };
    for (const type of USER_EVENTS) element.addEventListener(type, mark, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      for (const type of USER_EVENTS) element.removeEventListener(type, mark);
      observer?.disconnect();
    };
  }, []);

  // Follow the playhead: bring the current row into view on a seek, or while following
  useLayoutEffect(() => {
    const previous = previousRound.current;
    previousRound.current = currentRound;
    const element = scrollRef.current;
    if (element === null || currentIndex < 0) return;
    if (!shouldReveal(following.current, previous, currentRound)) return;
    following.current = true;
    const target = revealScrollTop({
      index: currentIndex,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      scrollTop: element.scrollTop,
      viewportHeight: heightOf(element),
    });
    if (target === null) return;
    element.scrollTop = target;
    setScrollTop(target);
  }, [currentRound, currentIndex]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (element === null) return;
    setScrollTop(element.scrollTop);
    if (performance.now() - userScrollAt.current > USER_SCROLL_MS) return;
    // The user scrolled: follow again only while the current row stays in view
    const index = roundIndex(latest.current.rounds, latest.current.currentRound);
    following.current =
      index >= 0 &&
      rowInView({
        index,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        scrollTop: element.scrollTop,
        viewportHeight: heightOf(element),
      });
  };

  const rowWindow = visibleWindow({
    count: rounds.length,
    rowHeight: ROW_HEIGHT,
    scrollTop,
    viewportHeight: viewport,
    overscan: OVERSCAN,
  });
  const levels = columns.map((column) => (column.series?.classification ?? null) !== null);
  const fmt = (n: number) => formatNumber(n, lang);
  const text: CellText = {
    lang,
    level: (id) => t(`polarization.levels.${id}`, { defaultValue: id }),
    exact: (value) => t("polarization.table.fullValue", { value: csvNumber(value) }),
    pending: t("polarization.table.cellPending"),
    none: t("polarization.table.cellNone"),
    error: (message) => t("polarization.table.cellError", { message }),
    unsupported: (column) =>
      t("polarization.table.cellUnsupported", { name: column.meta.name, k: column.k }),
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative min-h-0 flex-1 overflow-auto border-t border-border"
    >
      <table
        aria-label={t("polarization.table.aria")}
        aria-rowcount={rounds.length + 1}
        className="w-max min-w-full border-separate border-spacing-0 font-sans text-[12px]"
      >
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow aria-rowindex={1} className="border-b-0 hover:bg-transparent">
            <TableHead
              scope="col"
              title={onSeekRound ? t("polarization.table.seekTip") : undefined}
              className={cn(HEAD, "left-0 z-3 text-right")}
            >
              {t("polarization.table.round")}
            </TableHead>
            {columns.map((column, index) => (
              <Fragment key={column.key}>
                <TableHead scope="col" title={column.label} className={HEAD}>
                  <ColumnHeader
                    column={column}
                    notForK={t("polarization.table.notForK", { k: column.k })}
                  />
                </TableHead>
                {levels[index] ? (
                  <TableHead
                    scope="col"
                    aria-label={t("polarization.table.levelOf", { label: column.label })}
                    title={t("polarization.table.levelOf", { label: column.label })}
                    className={HEAD}
                  >
                    {t("polarization.table.level")}
                  </TableHead>
                ) : null}
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowWindow.padTop > 0 ? (
            <tr aria-hidden="true" style={{ height: rowWindow.padTop }} />
          ) : null}
          {rounds.slice(rowWindow.start, rowWindow.end).map((round, offset) => {
            const current = round === currentRound;
            return (
              <TableRow
                key={round}
                aria-rowindex={rowWindow.start + offset + 2}
                aria-current={current ? "true" : undefined}
                onClick={onSeekRound ? () => onSeekRound(round) : undefined}
                className={cn(
                  "border-b-0",
                  onSeekRound && "cursor-pointer",
                  current && "bg-accent hover:bg-accent",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    CELL,
                    "sticky left-0 z-1 font-medium",
                    current ? "bg-accent text-primary" : "bg-card",
                  )}
                >
                  {onSeekRound ? (
                    <button
                      type="button"
                      aria-label={t("polarization.table.seekAria", { round: fmt(round) })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSeekRound(round);
                      }}
                      className="rounded px-1 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {fmt(round)}
                    </button>
                  ) : (
                    fmt(round)
                  )}
                </th>
                {columns.map((column, index) => (
                  <ColumnCells
                    key={column.key}
                    column={column}
                    cell={tableCell(column.series, column.supported, round)}
                    level={levels[index] === true}
                    text={text}
                  />
                ))}
              </TableRow>
            );
          })}
          {rowWindow.padBottom > 0 ? (
            <tr aria-hidden="true" style={{ height: rowWindow.padBottom }} />
          ) : null}
        </TableBody>
      </table>
      {rounds.length === 0 ? (
        <p role="status" className="p-6 text-center font-sans text-[12px] text-muted-foreground">
          {emptyText}
        </p>
      ) : null}
    </div>
  );
}

/** A column's header: line sample and label (series), or the measure name and its beta badge. */
function ColumnHeader({ column, notForK }: { column: TableColumn; notForK: string }) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      {column.color === null || column.dash === null ? null : (
        <LineSample color={column.color} dash={column.dash} />
      )}
      <span className="max-w-[220px] truncate text-foreground">{column.label}</span>
      {column.color === null && column.meta.beta ? <BetaBadge /> : null}
      {column.supported ? null : <span className="text-[10.5px] font-normal">({notForK})</span>}
    </span>
  );
}

/** "—" with what it stands for (screen readers read the text, the pointer gets a title). */
function Dash({ label, className }: { label: string; className?: string }) {
  return (
    <TableCell title={label} className={cn(CELL, "text-muted-foreground", className)}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </TableCell>
  );
}

function dashLabel(cell: Exclude<Cell, { kind: "value" }>, column: TableColumn, text: CellText) {
  switch (cell.kind) {
    case "pending":
      return text.pending;
    case "error":
      return text.error(cell.message);
    case "none":
      return text.none;
    default:
      return text.unsupported(column);
  }
}

/** A column's cells for one round: its value, and its level when it has thresholds. */
function ColumnCells({
  column,
  cell,
  level,
  text,
}: {
  column: TableColumn;
  cell: Cell;
  level: boolean;
  text: CellText;
}) {
  if (cell.kind !== "value") {
    const label = dashLabel(cell, column, text);
    return (
      <>
        <Dash label={label} />
        {level ? <Dash label={label} className="text-left font-sans" /> : null}
      </>
    );
  }
  let levelCell = null;
  if (level) {
    levelCell =
      cell.level === null ? (
        <Dash label={text.none} className="text-left font-sans" />
      ) : (
        <TableCell className={cn(CELL, "text-left font-sans")}>{text.level(cell.level)}</TableCell>
      );
  }
  return (
    <>
      <TableCell title={text.exact(cell.value)} className={CELL}>
        {formatMeasureValue(cell.value, text.lang)}
      </TableCell>
      {levelCell}
    </>
  );
}
